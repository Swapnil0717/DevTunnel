// The About and Guides pages use the same signed-out shell as the legal pages
// (header, content column, site footer; no session lookup), so they are always
// reachable and cache well. This route group only exists to keep them apart
// from the legal pages in the file tree.
export { default } from "../(legal)/layout";
