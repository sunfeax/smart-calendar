-- CreateEnum
CREATE TYPE "TagColor" AS ENUM ('GRAY', 'RED', 'ORANGE', 'YELLOW', 'GREEN', 'TEAL', 'BLUE', 'VIOLET', 'PINK');

-- AlterTable
ALTER TABLE "Tag" ALTER COLUMN "color" DROP DEFAULT;
ALTER TABLE "Tag" ALTER COLUMN "color" TYPE "TagColor" USING upper("color")::"TagColor";
ALTER TABLE "Tag" ALTER COLUMN "color" SET DEFAULT 'GRAY';
