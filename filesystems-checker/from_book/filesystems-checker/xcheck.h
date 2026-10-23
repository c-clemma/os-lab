// Based on code provided by Patrick Sharp linked from the OSTEP website.
#ifndef XCHECK_H
#define XCHECK_H

#include <stdint.h>

/*
 * On-disk layout of an xv6 file system image.
 *
 * Two different kinds of facts show up below, and it matters which is
 * which - every constant is tagged (a) or (b):
 *
 *   (a) FORMAT facts. True for every xv6 image, no matter how it was
 *       built: the size of a block, the byte layout of a dinode, the
 *       type numbers, the fact that the superblock always lives in
 *       block 1. Safe to hardcode.
 *
 *   (b) IMAGE facts. True only of the one image you were handed: how
 *       many inodes it has, where its inode region starts, how big it
 *       is. These live *inside the superblock stored in the image*,
 *       not in a #define here. A test image is free to use different
 *       values, and your checker has to work anyway.
 *
 * If you ever see yourself writing "#define NINODES 200" or similar,
 * stop - that is exactly the (b)-mistake this comment is warning about
 * (see Finding 4 of "filesystems-checker fork review.md" in this
 * folder for a real example of it going wrong).
 */

typedef uint8_t u8;
typedef uint16_t u16;
typedef uint32_t u32;

#define BSIZE (512) /* (a) block size in bytes */

#define T_DIR (1)  /* (a) directory */
#define T_FILE (2) /* (a) regular file */
#define T_DEV (3)  /* (a) device file */
/* (a) type == 0 means "unallocated"; anything else is invalid. */

#define NDIRECT (12)                     /* (a) direct addresses per inode */
#define NINDIRECT (BSIZE / sizeof(u32))  /* (a) derived, not a magic number */
#define MAXFILE (NDIRECT + NINDIRECT)    /* (a) derived */

#define DIRSIZ (14) /* (a) max chars in a file name */

#define SBSTART (1) /* (a) the superblock is always block 1 - that's
                       * position, i.e. format. Its *contents* are (b):
                       * read every field of the struct below from the
                       * image, never assume a value for it. */

typedef struct {
  u32 size;       /* (b) total blocks in this image */
  u32 nblocks;    /* (b) number of data blocks */
  u32 ninodes;    /* (b) number of inodes */
  u32 nlog;       /* (b) number of log blocks */
  u32 logstart;   /* (b) block number of the first log block */
  u32 inodestart; /* (b) block number of the first inode block */
  u32 bmapstart;  /* (b) block number of the first free-bitmap block */
} superblock;

/* On-disk inode. The field layout is (a) - fixed by xv6 - but how many
 * of these an image has, and where they start, are (b): see superblock
 * above. */
typedef struct {
  u16 type;             /* file type */
  u16 major;            /* major device number (T_DEV only) */
  u16 minor;            /* minor device number (T_DEV only) */
  u16 nlink;            /* number of links to this inode */
  u32 size;             /* file size in bytes */
  u32 addrs[NDIRECT + 1]; /* data block addresses, +1 for the indirect block */
} dinode; /* (a) always 64 bytes: sizeof(dinode) == 64 */

/* Directory entry. Layout is (a); how many fit in one block is BSIZE /
 * sizeof(dirent) - derive it, don't hardcode 32. */
typedef struct {
  u16 inum;
  char name[DIRSIZ];
} dirent; /* (a) always 16 bytes */

/* xv6 images are little-endian on disk. Use these on every multi-byte
 * field you read so the checker also works on a big-endian machine. (a) */
u16 xshort(u16 x);
u32 xint(u32 x);

#endif
