import { describe, expect, it } from "vitest";
import {
  DELTA_BAND_BY_ROW_STATUS,
  DELTA_GLYPH,
  TONE_BY_DELTA_BAND,
  describeDelta,
  previewBand,
  type ApprovalRowStatus,
} from "@/lib/format/delta";
import { EM_DASH } from "@/lib/format/punct";
import { ApprovalRowStatus as ApprovalRowStatusSchema } from "@/lib/schemas/wire/common";

describe("the band map covers the wire enum", () => {
  it("has an entry for every ApprovalRowStatus the API can send", () => {
    expect(Object.keys(DELTA_BAND_BY_ROW_STATUS).sort()).toEqual(
      [...ApprovalRowStatusSchema.options].sort(),
    );
  });
});

describe("colour follows band membership, not direction", () => {
  it("gives a rise and a fall outside the band the same tone", () => {
    const up = describeDelta({ status: "above_threshold", percent: "8.0" });
    const down = describeDelta({ status: "below_threshold", percent: "-8.0" });
    expect(up.tone).toBe(down.tone);
    expect(up.tone).toBe("warning");
  });

  it("separates them by glyph instead", () => {
    expect(describeDelta({ status: "above_threshold", percent: "8.0" }).glyph).toBe("↑");
    expect(describeDelta({ status: "below_threshold", percent: "-8.0" }).glyph).toBe("↓");
  });

  it("treats an in-band move as needing no attention regardless of direction", () => {
    expect(describeDelta({ status: "within_band", percent: "4.0" }).tone).toBe("success");
    expect(describeDelta({ status: "within_band", percent: "-4.0" }).tone).toBe("success");
  });
});

describe("the status owns the colour, the number does not", () => {
  /**
   * The row that reads +10.0% and is still held. A client that re-derived the band from the rendered
   * figure would paint this one green while the badge beside it says 超出閾值.
   */
  it("keeps a held row out of band even when the display figure looks in-band", () => {
    const view = describeDelta({ status: "above_threshold", percent: "10.0" });
    expect(view.text).toBe("+10.0%");
    expect(view.band).toBe("out_of_band");
  });
});

describe("Δ that does not exist", () => {
  it.each<ApprovalRowStatus>(["pending_new", "needs_margins", "rejected", "superseded"])(
    "renders %s as an em dash with no direction",
    (status) => {
      const view = describeDelta({ status, percent: null });
      expect(view.text).toBe(EM_DASH);
      expect(view.glyph).toBe("");
      expect(view.direction).toBeNull();
      expect(view.band).toBe("not_applicable");
      expect(view.tone).toBe("neutral");
    },
  );
});

describe("direction", () => {
  it("prefers the server's answer over the sign of the figure", () => {
    const view = describeDelta({ status: "within_band", percent: "0.0", direction: "up" });
    expect(view.direction).toBe("up");
    expect(view.glyph).toBe("↑");
  });

  it("derives from the rounded figure so the glyph cannot contradict the number", () => {
    const view = describeDelta({ status: "within_band", percent: 0.04 });
    expect(view.text).toBe("0.0%");
    expect(view.direction).toBe("flat");
    expect(view.glyph).toBe("");
  });

  it("has a glyph for every direction the wire can send", () => {
    expect(Object.keys(DELTA_GLYPH).sort()).toEqual(["down", "flat", "up"]);
  });
});

describe("tones", () => {
  it("maps every band", () => {
    expect(TONE_BY_DELTA_BAND).toEqual({
      out_of_band: "warning",
      in_band: "success",
      not_applicable: "neutral",
    });
  });
});

describe("previewBand", () => {
  const band = { upPercent: 10, downPercent: 8 };

  it("is inclusive at both ends", () => {
    expect(previewBand(10, band)).toBe("in_band");
    expect(previewBand(-8, band)).toBe("in_band");
  });

  it("holds the asymmetric edge", () => {
    expect(previewBand(10.04, band)).toBe("out_of_band");
    expect(previewBand(-8.5, band)).toBe("out_of_band");
    expect(previewBand(-9, band)).toBe("out_of_band");
  });

  it("treats no movement as in band", () => {
    expect(previewBand(0, band)).toBe("in_band");
  });
});
