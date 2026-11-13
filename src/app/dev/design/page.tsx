import type { Metadata } from "next";
import { Gallery } from "./Gallery";

export const metadata: Metadata = {
  title: "Design kit · WorkEspoo",
  description: "Every component of the WorkEspoo kit in every state, with synthetic content. Dev only.",
};

/** Dev gallery of src/components/we. Every person shown is synthetic. Sample text lives in ./samples.ts. */
export default function DesignGalleryPage() {
  return <Gallery />;
}
