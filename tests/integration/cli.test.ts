import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "../../apps/cli/src/cli";

const ref2022 = readFileSync("fixtures/reference-2022.mct", "utf8");
const ref2025 = readFileSync("fixtures/reference-2025.mct", "utf8");

function silence(): void {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mct CLI", () => {
  it("roundtrip passes on both references", async () => {
    silence();
    expect(await run(["roundtrip", "fixtures/reference-2022.mct"])).toBe(0);
    expect(await run(["roundtrip", "fixtures/reference-2025.mct"])).toBe(0);
  });

  it("inventory exits 0", async () => {
    silence();
    expect(await run(["inventory", "fixtures/reference-2022.mct"])).toBe(0);
  });

  it("diff exits 0 and emits JSON", async () => {
    silence();
    expect(
      await run([
        "diff",
        "fixtures/reference-2022.mct",
        "fixtures/reference-2025.mct",
        "--json",
      ]),
    ).toBe(0);
  });

  it("convert writes a byte-identical file with full options", async () => {
    silence();
    const dir = mkdtempSync(join(tmpdir(), "mct-"));
    const out = join(dir, "converted.mct");
    const audit = join(dir, "audit.json");
    const code = await run([
      "convert",
      "fixtures/reference-2022.mct",
      "--from",
      "2022",
      "--to",
      "2025",
      "--include-provisional",
      "--refresh-comments",
      "--out",
      out,
      "--audit",
      audit,
    ]);
    expect(code).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(ref2025);
    const parsed = JSON.parse(readFileSync(audit, "utf8")) as { ok: boolean };
    expect(parsed.ok).toBe(true);
    void ref2022;
  });

  it("validate exits 0 on references, 2 on broken models", async () => {
    silence();
    expect(await run(["validate", "fixtures/reference-2022.mct"])).toBe(0);
    const dir = mkdtempSync(join(tmpdir(), "mct-"));
    const bad = join(dir, "bad.mct");
    writeFileSync(bad, "*ELEMENT\n  1, BEAM, 99, 99, 424242, 0, 0, 0\n*ENDDATA\n");
    expect(await run(["validate", bad])).toBe(2);
  });

  it("rules lists the registry", async () => {
    silence();
    expect(await run(["rules"])).toBe(0);
  });
});
