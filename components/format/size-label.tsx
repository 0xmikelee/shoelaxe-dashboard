import type * as React from "react";

import { formatSize } from "@/lib/format/size";
import { Num, type NumProps } from "@/components/format/num";

export interface SizeLabelProps extends Omit<NumProps, "children"> {
  /** Rendered verbatim, whitespace-normalised: `US 9`, `US 7.5`, `US 7Y`, `EU 41`. Never `US 9.0`. */
  value: string;
}

export function SizeLabel({ value, ...props }: SizeLabelProps) {
  return <Num {...props}>{formatSize(value)}</Num>;
}
