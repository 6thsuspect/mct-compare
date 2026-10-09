import type { SemanticChange } from "@mct/shared-types";
import { describe, expect, it } from "vitest";
import { semanticCsv, semanticJson } from "./export";

const change = (over: Partial<SemanticChange>): SemanticChange => ({
  key: "k",
  label: "label",
  section: "NODE",
  category: "geometry",
  status: "modified",
  ...over,
});

describe("semanticCsv", () => {
  it("emits one row per field with header", () => {
    const csv = semanticCsv([
      change({
        key: "3",
        label: "Node 3",
        aLines: [30],
        bLines: [30],
        fields: [
          { field: "X", before: "0", after: "1.5" },
          { field: "Y", before: "0", after: "0" },
        ],
      }),
    ]);
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe(
      "status,category,section,key,label,field,before,after,aLines,bLines,note",
    );
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe("modified,geometry,NODE,3,Node 3,X,0,1.5,30,30,");
  });

  it("emits a single row for presence-only changes", () => {
    const csv = semanticCsv([
      change({ status: "added", key: "9", label: "Node 9", bLines: [99] }),
    ]);
    const rows = csv.split("\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toBe("added,geometry,NODE,9,Node 9,,,,,99,");
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    const csv = semanticCsv([
      change({
        label: 'A "quoted", label',
        fields: [{ field: "F", before: "x\ny", after: "a,b" }],
      }),
    ]);
    expect(csv).toContain('"A ""quoted"", label"');
    expect(csv).toContain('"x\ny"');
    expect(csv).toContain('"a,b"');
  });
});

describe("semanticJson", () => {
  it("round-trips through JSON", () => {
    const changes = [change({ status: "removed" })];
    expect(JSON.parse(semanticJson(changes))).toEqual(changes);
  });
});
