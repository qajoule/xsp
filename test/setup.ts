// Preloaded by bunfig.toml. Outside Hugo there is no js.Build, so this
// provides the "@params" module with the same copy that js.html passes.
import { mock } from "bun:test";
import content from "../data/content.toml";

mock.module("@params", () => ({ default: { content } }));
