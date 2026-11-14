CREATE TABLE "applicant_ranking" (
	"job_id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"pins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published" jsonb,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application" (
	"id" text PRIMARY KEY NOT NULL,
	"talent_id" text NOT NULL,
	"job_id" text NOT NULL,
	"company_id" text NOT NULL,
	"status" text DEFAULT 'interviewing' NOT NULL,
	"plan" jsonb NOT NULL,
	"state" jsonb NOT NULL,
	"assessment" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"assessed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "application_turn" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"index" integer NOT NULL,
	"role" text NOT NULL,
	"kind" text NOT NULL,
	"requirement_id" text,
	"text" text NOT NULL,
	"sentences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_mode" text,
	"client_turn_id" text,
	"removed_at" timestamp with time zone,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applicant_ranking" ADD CONSTRAINT "applicant_ranking_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_ranking" ADD CONSTRAINT "applicant_ranking_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_turn" ADD CONSTRAINT "application_turn_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_talent_job_uq" ON "application" USING btree ("talent_id","job_id");--> statement-breakpoint
CREATE INDEX "application_job_idx" ON "application" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_turn_index_uq" ON "application_turn" USING btree ("application_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "application_turn_client_uq" ON "application_turn" USING btree ("application_id","client_turn_id");