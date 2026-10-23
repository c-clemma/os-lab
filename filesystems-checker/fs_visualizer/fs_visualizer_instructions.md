Instructions for Claude to build the file system visualizer. Kept for posterity.

# Generate a visualization tool for xv6 file system images
The goal is to produce a tool that students in the OS class can use to visualize and explore what is going on in the xv6 file sytem images used in the class. The goal is for this to help them in building and debugging their file system checker for lab 3.

## Changes from version 3
- Build a directory tree.
- Display the tree on the right side under the details pane in its own pane
- Clicking on an item in the directory goes to its inode

## Changes from version 2
- Clicking on an indirect data block should draw an arrow from the inode to the indirect block to the selected block.

## Changes from version 1
- Add a color for all allocated data blocks.
- Allow me to change the relative sizes of the panes by dragging on the dividers
- A return in the search fields should be the same as clicking the search button.
- Remove "samples are in sample-images/" from the top. 

## Instructions
- Please read through the rough lab instructions in the lab 3 folder and here in the "lab - README.md" file, which is from the base implemntation on teh webiste.
- Please take a look at the implementaiton provided by the book in the "from_book" folder for the basic background.
- Please read through these instructions and see if anything doesn't makes sense or needs to be clarified. Add those comments below.
- Please identify any suggestions for improving this or making it easier to use, and add those comments below.
- Please develop a plan for how to structure and build this project and add them below.

## What the visulaizer should include
- It should be a web page where students can choose an image file to load
- Graphically it should have three panes: right shows details of the currently-selected item, bottom shows text output if needed, left (big) shows the disk layout graphically.
- It should graphically show the layout of the file system with the super block, inodes, bitmaps, and data block sections.
- Each section should have a different light color to differentiate it.
- Each section should be approprateily split up to show data (bits for bitmaps, blocks for others).
- Directory and indirect data nodes should have their own colors.
- Clicking on a block should show more information on the right side of the screen and draw arrows as appropriate that connect it for inodes.
- Inodes should show their fields in the details pane in both human-readable and hex format.
- When an inode is selected, arrows should be drawn from it to the data blocks it represesnts and the bitmap it refers to.
- When a data block is selected it should draw arrows to its bitmap and the inode that points to it.
- When a Directory data block is selected, there should be a button in the details pane that will draw arrows to the inodes each directory entry points to.

## Changes based on feedback
- Include the log node in the sections, but don't go into any detail on it.
- It should read the sizes from the actual super block and show those details in the super block.
- Clicking a bitmap should highlight (with an arrow) what points to it.
- Indirect blocks should be handled appropriately - own color and decoded information with links. Clicking on each link in the details pane should draw the arrow for it - don't draw 128 arrows at once.
- empty items in directories should be shown as (empty)
- Do not do any consistency checks. If the tool is trying to draw somethign that is inconsistent it should show that with a red box around the inconsistent part. E.g., if it points to a bitmap entry that is not set, it should higlight that in red. Or if an inode/data block is selected that does not have its bitmap set it should point to that and higlight it in red.
- 100% client-side implementation
- Do add a fixed legend/key
- Bottom pane for a live hex+ASCII dump is great
- precomputing referenced by is fine; but don't expose it to the students as such
- Jump to block/inode number is a great idea. Also display a status indicator somewhere that says the number of the current block.
- Also: add a "search all inodes for block reference" that would search through all inodes for references to a particular block.
- Also: add a "search all directories for inode reference" that would search through all directory blocks for references to a particular inode reference.
- Drag-and drop of image is fine.
- New feature: include the ability to double-click on the details fields and change their values and then save the result to a new image. The idea is that I can use this to create corrupt images for testing.

## (Added to above - keep text for reference) Things that don't make sense or are missing

1. **Missing region: the log.** The real on-disk layout (from `xcheck.h`) has five regions, not four: boot block (block 0), superblock (block 1), **log** (blocks 2-31, `logstart`/`nlog`), inodes (32-57), bitmap (58), data (59-999). The spec only names "super block, inodes, bitmaps, and data block sections" - the log is left out. A student loading a real image would see ~30 blocks with no assigned color or meaning unless this is decided.
2. **Hardcoded vs. dynamic geometry.** Should the visualizer read `size`/`nblocks`/`ninodes`/`nlog`/`logstart`/`inodestart`/`bmapstart` from the actual superblock bytes in the loaded image, or assume the one fixed geometry all current sample images use (`FSSIZE=1000`, `NINODES=200`, etc.)? I'd recommend reading it dynamically from the image every time - it's exactly the discipline the `xcheck.c` reference implementation got wrong (see "Finding 4" in `filesystems-checker fork review.md`), and it means the tool keeps working unchanged if the course ever changes `mkfs` parameters.
3. **Bottom text pane's purpose is unspecified.** "Shows text output if needed" doesn't say when or with what content. See the hex-dump suggestion below for a concrete proposal.
4. **Clicking a bitmap bit isn't specified.** The spec says what happens when an inode, a data block, or a directory block is clicked, but not a bitmap bit itself - presumably it should highlight and arrow back to the data block it covers, for symmetry with the other cases, but that should be said explicitly.
5. **Indirect blocks aren't distinguished from data blocks.** The block pointed at by an inode's 13th address (`addrs[12]`) is itself a table of up to 128 more block addresses, and two of the twelve required checks are specifically about it. Should clicking an inode draw arrows through the indirect block to all of its (up to 128) targets immediately, or should that only happen behind a second click/button - mirroring the directory-entries button already in the spec - so a nearly-full indirect block doesn't produce an unreadable arrow explosion by default?
6. **Empty directory entries (`inum == 0`) aren't addressed.** Should the "show directory entries" button skip unused slots, list them as "(empty)", or something else?
7. **The biggest open question: should the tool do any of the 12 consistency checks itself?** The stated goal is to help students build and debug their checker, but the review of the `patrick-sharp` fork (`filesystems-checker fork review.md`, Finding 1) found that a fully worked, unhidden reference checker undermines this exact assignment. I'd recommend the visualizer expose only raw structural facts - an address's numeric value, whether it falls in `[0, size)`, which inode(s) currently point at a given block, a bitmap bit's raw value - and never a verdict like "check #7 would fail here." That line is easy to cross by accident once you're already computing "is this address in bounds" purely for rendering purposes, so it's worth deciding explicitly now.
8. **Client-side only?** Worth confirming the "choose an image file to load" step is meant to be 100% client-side (`<input type="file">` + `FileReader`/`ArrayBuffer`, no upload to any server) - that's simplest, needs no install, and works even from a `file://` URL. Nothing in the requirements actually needs a server.

## (Added to above - keep text for reference) Suggestions for improvement

- Add a fixed legend/key (a small always-visible strip mapping each region's color to its name) so the color coding from item 1 above is self-explanatory without hovering over anything.
- Give the bottom "text output" pane a concrete default purpose: a live hex+ASCII dump of whichever block is currently selected, with the specific bytes for the selected inode/dirent highlighted within it. That's exactly the byte-level view students will need when writing their own `mmap()`-based C code, and it resolves the "if needed" ambiguity from item 3.
- Precompute a "referenced by" reverse map once per image load (block -> owning inode(s), inode -> referencing directory entries). This is needed anyway for the required arrow behaviors, and it also lets the grid show small badges for raw facts like "0 owners" or "2 owners" on a block - useful context without being a verdict (see item 7).
- Ship 2-3 sample images alongside the tool (e.g. `base-mkfs.img` plus a couple of the deliberately-corrupted images from `from_book/filesystems-checker/tests/`), selectable from a dropdown in addition to "choose file," so students can start exploring before they've built their own `mkfs`/test image.
- Add a "jump to block #" / "jump to inode #" search box - with ~1000 blocks in the grid, hunting for a specific one by eye will get old fast.
- Support drag-and-drop of the image file onto the page in addition to the file picker (same underlying `File`/`ArrayBuffer` code path, small UX win).
- Consider a later "compare two images side by side" mode (e.g. a known-good image next to a corrupted test case). Not needed for a first version, but worth keeping the data model (parse -> structured object, independent of rendering) clean enough that this isn't hard to add afterward.

## Strucutre and plan for implementation

*(Updated to integrate "Changes based on feedback" above. Judgment calls I made where the feedback left something implicit are called out explicitly below, so they're easy to spot and overrule.)*

**Overall approach:** a single static page, no server and no build step - everything runs by opening `index.html` directly, by drag-and-drop, or via any static file server. **No `<script type="module">`** - plain classic `<script>` tags attaching to one shared `window.FS` namespace, in dependency order. This is a deliberate choice, not an oversight: ES module `import` of local files is blocked by CORS in Chrome when opened via a bare `file://` URL, which would silently break "just double-click index.html" - classic scripts don't have that restriction. No framework or external dependencies; the whole tool is well within what plain HTML/CSS/JS/SVG handles at this scale (~1000 blocks).

```
fs_visulalizer/
  index.html        -- markup for the three panes, toolbar, file picker, legend
  style.css         -- pane layout, grid/cell styling, region colors, .inconsistent style
  js/
    fsimage.js      -- constants, byte-level read/write helpers, parseImage(), geometry derivation
    model.js        -- per-block role classification (dir/indirect/plain/log/...), the two on-demand search functions
    hexdump.js       -- renders a hex+ASCII dump of one block with a byte range highlighted
    arrows.js        -- SVG overlay: clear() / drawArrow(fromEl, toEl, {inconsistent})
    grid.js         -- builds the left-pane grid from the parsed model; delegated click/hover handling; jump-to
    details.js      -- right-pane renderer per selection kind, incl. editable fields and indirect/directory link lists
    tree.js         -- right-pane directory tree (below details), built from the root inode; clicking an entry selects its inode
    main.js         -- app state, file loading (input/drag-drop), toolbar wiring, edit-commit -> reparse -> rerender, download/reset
  sample-images/
    base-mkfs.img                          -- clean image (copied from from_book/filesystems-checker/)
    bad-direct-address.img                 -- from_book test 5: direct address out of range
    indirect-entry-marked-free.img         -- from_book test 19: valid indirect-block entry whose bitmap bit is 0
    bitmap-marks-free-block-in-use.img     -- from_book test 20: bitmap bit set but nothing references that block
```
These are opened via the normal "choose file" picker (no in-page dropdown) - **judgment call:** fetching a bundled sample straight from JS (`fetch('sample-images/...')`) is *also* blocked under a bare `file://` URL in Chrome, the same CORS issue as ES modules, so a dropdown that "just works" regardless of how the page was opened isn't possible without a server. Shipping the files and pointing to them from a line of help text next to "choose file" gets almost all the benefit with none of the fragility.

**Data model**, tied directly to the exact struct layout documented in `xcheck.h`, all read **dynamically from the loaded image**, never hardcoded (integrates feedback item 2):
- `BSIZE = 512` is a true xv6 constant, safe to hardcode.
- Superblock: the 7 little-endian `u32` fields at byte offset 512 (block 1) - `size, nblocks, ninodes, nlog, logstart, inodestart, bmapstart`.
- Derived (read-only, recomputed after every edit): inode-block count = `ceil(ninodes/8)`; bitmap-block count = `ceil(size/4096)`; `datastart = bmapstart + bitmapBlockCount`; `log region = [logstart, logstart+nlog)`.
- Inode `i` (0-indexed slot, `ninodes` of them; inode 0 is conventionally unallocated, inode 1 is root): offset = `inodestart*512 + i*64`; fields `type/major/minor/nlink` (`u16` LE), `size` (`u32` LE), `addrs[13]` (`u32` LE each, `addrs[0..11]` direct + `addrs[12]` indirect).
- Bitmap: bit `i` (for block `i`) = `(byte[floor(i/8)] >> (i%8)) & 1`, starting at `bmapstart*512`.
- Directory block `dirent`s: 32 entries/block, each 16 bytes = `inum` (`u16` LE) + 14 raw NUL-padded name bytes.
- All byte-level writers mirror the readers exactly (same offsets/widths/endianness) so edits and reads never drift apart.

**Block/inode role classification** (`model.js`, replaces the earlier "reverse map exposed as badges" idea - feedback said precomputing is fine but not exposing it "as such"): a single pass over all in-use inodes tags each block as `boot | superblock | log | inode | bitmap | dir | indirect | data`, used only to pick a grid color and to decide what a click should decode - **never rendered as an owner count or "N references" badge**. Ownership facts are only ever surfaced through an explicit action: clicking an item (arrows to its *direct* structural neighbors only) or one of the two search boxes below - never passively at rest.

**Left pane / grid (`grid.js`):** one continuous strip, grouped into colored sections in disk order:
- Boot (1 block) and superblock (1 block): rendered, but boot gets no decoded detail; superblock decodes its 7 fields (feedback item 2) plus the derived counts as read-only.
- Log (`nlog` blocks): its own color; clicking one shows only "Log block N - part of the write-ahead log, not decoded here" plus the generic hex dump - **no** per-record decoding (feedback item 1: include it, but no detail).
- Inodes: split at **inode granularity**, not block granularity (`ninodes` small cells, ~8 per physical 64-byte-aligned block) - this is the same "smallest natural unit" principle the spec already applies to the bitmap, and it's what makes individual inodes clickable/selectable at all. Unallocated inodes (`type == 0`) are shown dimmed but still selectable/editable (useful for fabricating a new file when building a corrupt test image).
- Bitmap: split at **bit granularity** (`size` cells, one per representable block, not one per physical bitmap block) per the spec's "bits for bitmaps" - clicking a bit auto-draws arrows to whichever inode(s) reference that block (feedback item 3), via the same lookup the search box uses.
- Data region: each block classified as plain / directory / indirect, each with its own color (feedback item: "directory and indirect data nodes should have their own colors").
- A fixed legend strip (feedback: "do add") maps every color to its name, always visible, no hover needed.
- A status readout (feedback: "display a status indicator...with the number of the current block") tracks whatever's under the mouse, falling back to the current selection when not hovering anything.
- One delegated click/hover listener resolves `data-kind`/`data-index` attributes generically rather than per-cell listeners.

**Arrows and the "inconsistent" red box (`arrows.js` + `details.js`)** - feedback: no consistency checking, but flag things the tool itself can't sensibly draw:
- **Out-of-range address** (e.g. points past `size`, or into metadata): there's no real cell to point an arrow at, so instead of an arrow the address's own field in the details pane gets a red box and an "(out of range)" note. No arrow is drawn.
- **In-range address whose bitmap bit is 0:** the arrow is drawn normally, and the bitmap cell at the far end gets a red outline. **Judgment call:** I'm only doing this when we're actively tracing a real "inode/dirent claims block B" edge (i.e. following an inode's `addrs[]`, or a data block's "which inode(s) reference me" search) - not for the ~94% of data blocks that are legitimately free and would otherwise show a misleading red "0" just for being clicked with no inode pointing at them. This still covers exactly the two example cases from the feedback (an address pointing at an unset bit, and a selected block/inode whose claimed usage disagrees with the bitmap), while not turning "free block" itself into a false alarm. Flagging this interpretation explicitly in case the intent was broader.
- Indirect-block contents and directory contents are the two "many links" cases, and the feedback treats them differently on purpose: indirect entries (up to 128) are decoded as a list in the details pane and only draw **one arrow at a time**, on clicking that specific entry; directory entries (at most 32, usually a handful) keep the spec's original "one button draws all of them at once" behavior, since fan-out at that scale is still readable.
- Arrows are an absolutely-positioned `<svg>` overlay sized to the grid container, `<line>`/`<path>` with `marker-end`, endpoints from `getBoundingClientRect()` of the source/target cells, recomputed on every selection.

**Details pane (`details.js`):** one renderer per kind (superblock / inode / bitmap-bit / data / directory / indirect), each a field table of name, decimal, hex, and (for `type`) the symbolic name. Every field is **editable**: double-click a value to turn it into an input (accepts decimal or `0x..`), Enter/blur commits, Escape cancels (new feature from feedback). A directory's entry list shows empty (`inum==0`) slots as literal "(empty)" text (feedback item), non-empty ones as a name + a link to their target inode.

**Bottom pane (`hexdump.js`):** hex+ASCII dump (16 bytes/row) of whatever 512-byte block the current selection lives in, with the specific bytes for that selection (an inode's 64 bytes, a dirent's 16 bytes, a bitmap byte) highlighted - answers the earlier "text output if needed" ambiguity, and doubles as the byte-level view students need for their own C code.

**Toolbar (new, needed to host several confirmed features together):** four small inputs above the grid - jump to block #, jump to inode #, find references to block # (uses `model.searchInodesForBlock`, lists every direct/indirect hit, does not just draw arrows since there can be many), find references to inode # (uses `model.searchDirectoriesForInode`, lists every directory entry pointing at it). These are explicit, user-initiated lookups, distinct from the passive per-click arrows, which is what keeps them from being "the reverse map exposed as such."

**Editing and saving a modified image (`main.js` + `fsimage.js` writers) - new feature, for building corrupt test images:**
- Two buffers: a pristine `originalBuffer` (kept for "Reset") and a `workingBuffer` that edits mutate in place.
- Every committed edit (any field, including superblock fields) triggers a full re-parse + re-render of `workingBuffer` rather than an incremental patch - at ~1000 blocks this is cheap, and it's far less error-prone than trying to special-case which parts of the model a given field touches (a `bmapstart` edit, for instance, reshapes almost everything downstream).
- A status flag shows "Modified" once any edit has been made; "Reset to original" restores the pristine copy; "Download image" saves `workingBuffer` as a `.img` file via a `Blob` + object URL, entirely client-side.

**Suggested build order:**
1. `fsimage.js` parser + writers only, sanity-checked against `base-mkfs.img` under plain Node (no DOM needed for this module) by comparing known fields (root inode's type/nlink, superblock geometry) against the layout documented in `xcheck.h`.
2. `model.js` role classification + the two search functions, checked the same way against `base-mkfs.img` and one or two of the `from_book` test images.
3. Static colored grid + legend + status readout, no clicking yet - confirms region-boundary math visually before interactivity is added.
4. Click -> details pane text (read-only), including the indirect/directory link lists and red-box/out-of-range handling.
5. Arrow overlay for all the click cases; toolbar (jump + both searches).
6. Editable fields, reset/download, and the hex-dump pane last, since they build on everything above being stable.