import { notFound } from "next/navigation";

/** Unknown addresses: ends in the root not-found page, inside the public frame. */
export default function Missing(): never {
  notFound();
}
