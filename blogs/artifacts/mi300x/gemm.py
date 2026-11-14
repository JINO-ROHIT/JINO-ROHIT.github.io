"""Educational Gluon FP16 GEMM for MI300X (gfx942), with FP32 accumulation.

Run in a ROCm-enabled PyTorch + Triton environment with Gluon CDNA 3 support:
    python gemm.py
    python gemm.py --bench

C = A @ B; no alpha/beta, autograd, batching, or fused epilogue.
The tile and launch configuration are starting points, not benchmark claims.
M and N must be multiples of 64; K may have a partial final tile.
"""

import argparse

import torch
import triton
from triton.experimental import gluon
from triton.experimental.gluon import language as gl


@gluon.jit
def v0_naive(
    a_ptr,
    b_ptr,
    c_ptr,
    M,
    N,
    K,
    stride_am,
    stride_ak,
    stride_bk,
    stride_bn,
    stride_cm,
    stride_cn,
    BLOCK_M: gl.constexpr,
    BLOCK_N: gl.constexpr,
    BLOCK_K: gl.constexpr,
):
    pid = gl.program_id(axis=0)
    num_pid_n = gl.cdiv(N, BLOCK_N)

    pid_m = pid // num_pid_n
    pid_n = pid % num_pid_n

    gLoadLayoutA: gl.constexpr = gl.BlockedLayout(
        [1, 8],  # sizePerThread
        [512 // BLOCK_K, BLOCK_K // 8],  # threadsPerWarp
        [4, 1],  # warpsPerCTA
        [1, 0],  # order
    )

    gLoadLayoutB: gl.constexpr = gl.BlockedLayout(
        [8, 1],  # sizePerThread
        [BLOCK_K // 8, 512 // BLOCK_K],  # threadsPerWarp
        [1, 4],  # warpsPerCTA
        [0, 1],  # order
    )

    offs_am = gl.arange(0, BLOCK_M, gl.SliceLayout(1, gLoadLayoutA))
    offs_ak = gl.arange(0, BLOCK_K, gl.SliceLayout(0, gLoadLayoutA))

    offs_bn = gl.arange(0, BLOCK_N, gl.SliceLayout(0, gLoadLayoutB))
    offs_bk = gl.arange(0, BLOCK_K, gl.SliceLayout(1, gLoadLayoutB))

    a_base = a_ptr + pid_m * BLOCK_M * stride_am
    b_base = b_ptr + pid_n * BLOCK_N * stride_bn

    a_offsets = offs_am[:, None] * stride_am + offs_ak[None, :] * stride_ak
    b_offsets = offs_bk[:, None] * stride_bk + offs_bn[None, :] * stride_bn

    a_ptrs = a_base + a_offsets
    b_ptrs = b_base + b_offsets

    mfmaLayout: gl.constexpr = gl.amd.AMDMFMALayout(
        version=3, instr_shape=[16, 16, 16], transposed=True, warps_per_cta=[2, 2]
    )

    dotOpLayoutA: gl.constexpr = gl.DotOperandLayout(operand_index=0, parent=mfmaLayout, k_width=4) # each lane holds 4 consecutive K elements
    dotOpLayoutB: gl.constexpr = gl.DotOperandLayout(operand_index=1, parent=mfmaLayout, k_width=4)

    acc = gl.zeros((BLOCK_M, BLOCK_N), gl.float32, mfmaLayout)

    for k in range(0, gl.cdiv(K, BLOCK_K)):
        ga = gl.load(a_ptrs, mask=offs_ak[None, :] < K - k * BLOCK_K, other=0.0)
        gb = gl.load(b_ptrs, mask=offs_bk[:, None] < K - k * BLOCK_K, other=0.0)
        a = gl.convert_layout(ga, layout=dotOpLayoutA)
        b = gl.convert_layout(gb, layout=dotOpLayoutB)

        acc = gl.amd.cdna3.mfma(a, b, acc)

        a_ptrs += BLOCK_K * stride_ak
        b_ptrs += BLOCK_K * stride_bk

    c = acc.to(a_ptr.dtype.element_ty)

    gStoreLayoutC: gl.constexpr = mfmaLayout
    c = gl.convert_layout(c, layout=gStoreLayoutC)
    offs_cm = gl.arange(0, BLOCK_M, gl.SliceLayout(1, gStoreLayoutC))
    offs_cn = gl.arange(0, BLOCK_N, gl.SliceLayout(0, gStoreLayoutC))
    c_base = c_ptr + pid_m * BLOCK_M * stride_cm + pid_n * BLOCK_N * stride_cn
    c_offsets = stride_cm * offs_cm[:, None] + stride_cn * offs_cn[None, :]
    c_ptrs = c_base + c_offsets
    c_mask = (offs_cm[:, None] < M) & (offs_cn[None, :] < N)
    gl.store(c_ptrs, c, mask=c_mask)


def matmul(a, b):
    """Multiply FP16 matrices on the same gfx942 GPU, with M and N divisible by 64.

    Positive tensor strides are supported, including transposed inputs.
    Output is contiguous FP16. This wrapper does not register autograd.
    """
    if a.ndim != 2 or b.ndim != 2 or a.shape[1] != b.shape[0]:
        raise ValueError("Expected A[M,K] and B[K,N]")
    if a.dtype != torch.float16 or b.dtype != torch.float16:
        raise ValueError("This example requires FP16 inputs")
    if not a.is_cuda or a.device != b.device or torch.version.hip is None:
        raise ValueError("Inputs must be on the same ROCm GPU")
    arch = torch.cuda.get_device_properties(a.device).gcnArchName.split(":")[0]
    if arch != "gfx942":
        raise ValueError(f"This launch configuration targets gfx942, got {arch}")
    m, k = a.shape
    _, n = b.shape
    if min(m, n, k) <= 0 or min(*a.stride(), *b.stride()) <= 0:
        raise ValueError("Use nonempty matrices with positive strides")
    # v0_naive masks K only on loads; partial M/N tiles are not supported.
    if m % 64 or n % 64:
        raise ValueError("v0_naive requires M and N to be multiples of 64")
    c = torch.empty((m, n), device=a.device, dtype=torch.float16)
    # ROCm PyTorch deliberately uses the torch.cuda namespace.
    with torch.cuda.device(a.device):
        v0_naive[(triton.cdiv(m, 64) * triton.cdiv(n, 64),)](
            a, b, c, m, n, k, *a.stride(), *b.stride(), *c.stride(),
            BLOCK_M=64, BLOCK_N=64, BLOCK_K=32,
            num_warps=4,
        )
    return c


def check_correctness():
    torch.manual_seed(0)
    # Full output tiles, rectangular grids, and partial final K tiles.
    for m, n, k in [(128, 128, 128), (128, 192, 65), (64, 64, 1), (64, 256, 33)]:
        for transposed in (False, True):
            a = torch.randn((k, m) if transposed else (m, k),
                            device="cuda", dtype=torch.float16)
            b = torch.randn((n, k) if transposed else (k, n),
                            device="cuda", dtype=torch.float16)
            if transposed:
                a, b = a.T, b.T
            actual = matmul(a, b)
            # FP32 reference on the same quantized inputs, then the output cast.
            expected = (a.float() @ b.float()).half()
            torch.testing.assert_close(actual, expected, rtol=1e-2, atol=1e-2)
            print(f"PASS M={m} N={n} K={k}, transposed={transposed}")

    for m, n in [(65, 64), (64, 65)]:
        a = torch.empty((m, 32), device="cuda", dtype=torch.float16)
        b = torch.empty((32, n), device="cuda", dtype=torch.float16)
        try:
            matmul(a, b)
        except ValueError as error:
            assert "multiples of 64" in str(error)
        else:
            raise AssertionError("Partial M/N tiles must be rejected before launch")


def benchmark():
    m = n = k = 4096
    a = torch.randn((m, k), device="cuda", dtype=torch.float16)
    b = torch.randn((k, n), device="cuda", dtype=torch.float16)
    # Compile and verify before timing; report actual measurements only.
    torch.testing.assert_close(matmul(a, b), a @ b, rtol=1e-2, atol=5e-2)
    for name, fn in [("Gluon (includes output allocation)", lambda: matmul(a, b)),
                     ("torch.matmul (includes output allocation)", lambda: a @ b)]:
        ms = triton.testing.do_bench(fn)
        tflops = 2 * m * n * k / (ms * 1e-3) / 1e12
        print(f"{name}: {ms:.3f} ms, {tflops:.2f} TFLOP/s")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bench", action="store_true")
    args = parser.parse_args()
    if torch.version.hip is None or not torch.cuda.is_available():
        raise SystemExit("Run this example with ROCm-enabled PyTorch and a gfx942 GPU")
    print(f"PyTorch {torch.__version__}; ROCm {torch.version.hip}; Triton {triton.__version__}")
    print(torch.cuda.get_device_name())
    check_correctness()
    if args.bench:
        import triton.testing
        benchmark()
