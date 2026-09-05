-- AlterTable
ALTER TABLE "Account" ADD COLUMN "metadata" JSONB;

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "tags" TYPE JSONB USING CASE
    WHEN "tags" IS NULL THEN NULL
    ELSE to_jsonb("tags")
END;

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "attachments" TYPE JSONB USING CASE
    WHEN "attachments" IS NULL THEN NULL
    ELSE to_jsonb("attachments")
END;
