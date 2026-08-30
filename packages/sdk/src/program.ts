import { Program, type AnchorProvider } from "@coral-xyz/anchor";
import idl from "./idl/meme_lending.json" with { type: "json" };
import type { MemeLending } from "./idl/meme_lending.js";

export const MEME_LEND_IDL = idl as MemeLending;
export function createMemeLendProgram(provider: AnchorProvider): Program<MemeLending> {
  return new Program<MemeLending>(MEME_LEND_IDL, provider);
}
