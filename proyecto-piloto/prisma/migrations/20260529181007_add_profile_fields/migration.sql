-- AlterTable
ALTER TABLE "users" ADD COLUMN     "company" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3);
