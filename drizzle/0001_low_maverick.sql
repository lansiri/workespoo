CREATE TABLE "esco_concept" (
	"uri" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"label_en" text NOT NULL,
	"label_fi" text,
	"label_sv" text,
	"isco" text,
	"retired" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esco_occupation_fetch" (
	"occupation_uri" text PRIMARY KEY NOT NULL,
	"ok" boolean NOT NULL,
	"skill_count" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esco_occupation_skill" (
	"occupation_uri" text NOT NULL,
	"skill_uri" text NOT NULL,
	"relation" text NOT NULL,
	CONSTRAINT "esco_occupation_skill_occupation_uri_skill_uri_pk" PRIMARY KEY("occupation_uri","skill_uri")
);
--> statement-breakpoint
CREATE TABLE "esco_phrase_cache" (
	"phrase" text PRIMARY KEY NOT NULL,
	"uri" text,
	"decided_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"real_name" text,
	"business_id" text,
	"source" text NOT NULL,
	"masked" boolean DEFAULT true NOT NULL,
	"participating" boolean DEFAULT false NOT NULL,
	"digest_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_digest_token_unique" UNIQUE("digest_token")
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"employer_name" text DEFAULT '' NOT NULL,
	"employer_business_id" text,
	"sector" text DEFAULT 'unknown' NOT NULL,
	"municipality" text,
	"municipality_code" text,
	"region" text,
	"lang" text DEFAULT 'other' NOT NULL,
	"work_languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sentences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"posted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"esco_occupation_uris" text[] DEFAULT '{}'::text[] NOT NULL,
	"esco_skill_uris" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"raw" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce("job"."title", '') || ' ' || coalesce("job"."description", ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "job_skill" (
	"job_id" text NOT NULL,
	"skill_uri" text NOT NULL,
	"origin" text NOT NULL,
	CONSTRAINT "job_skill_job_id_skill_uri_origin_pk" PRIMARY KEY("job_id","skill_uri","origin")
);
--> statement-breakpoint
CREATE TABLE "need_card" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"company_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"body" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "interview" (
	"id" text PRIMARY KEY NOT NULL,
	"talent_id" text NOT NULL,
	"mode" text NOT NULL,
	"lang" text DEFAULT 'unknown' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"state" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "interview_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"interview_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal" (
	"talent_id" text NOT NULL,
	"id" text NOT NULL,
	"interview_id" text,
	"phrase" text NOT NULL,
	"phrase_own" text,
	"kind" text NOT NULL,
	"esco_uri" text,
	"esco_label_en" text,
	"esco_label_fi" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"has_example" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"added_by" text DEFAULT 'agent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_talent_id_id_pk" PRIMARY KEY("talent_id","id")
);
--> statement-breakpoint
CREATE TABLE "signal_card" (
	"talent_id" text NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"body" jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_card_talent_id_status_pk" PRIMARY KEY("talent_id","status")
);
--> statement-breakpoint
CREATE TABLE "talent" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"live_demo" boolean DEFAULT false NOT NULL,
	"in_pool" boolean DEFAULT false NOT NULL,
	"purge_after" timestamp with time zone,
	"persona_key" text,
	"agenda_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "talent_handle_unique" UNIQUE("handle"),
	CONSTRAINT "talent_agenda_token_unique" UNIQUE("agenda_token")
);
--> statement-breakpoint
CREATE TABLE "talent_identity" (
	"talent_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talent_language" (
	"talent_id" text NOT NULL,
	"code" text NOT NULL,
	"basis" text NOT NULL,
	CONSTRAINT "talent_language_talent_id_code_basis_pk" PRIMARY KEY("talent_id","code","basis")
);
--> statement-breakpoint
CREATE TABLE "turn" (
	"id" text PRIMARY KEY NOT NULL,
	"interview_id" text NOT NULL,
	"index" integer NOT NULL,
	"role" text NOT NULL,
	"kind" text NOT NULL,
	"target" text,
	"text" text NOT NULL,
	"sentences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentences_original" jsonb,
	"lang" text,
	"input_mode" text,
	"redacted_at" timestamp with time zone,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_item" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"intro_id" text NOT NULL,
	"talent_id" text NOT NULL,
	"company_id" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"place" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"event_id" text,
	"date" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"seed" text NOT NULL,
	"empty_needs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility" (
	"need_card_id" text NOT NULL,
	"need_card_version" integer NOT NULL,
	"talent_id" text NOT NULL,
	"card_version" integer NOT NULL,
	"eligible" boolean NOT NULL,
	"touched_requirement_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclusion" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eligibility_need_card_id_need_card_version_talent_id_pk" PRIMARY KEY("need_card_id","need_card_version","talent_id")
);
--> statement-breakpoint
CREATE TABLE "event_company" (
	"event_id" text NOT NULL,
	"company_id" text NOT NULL,
	"number" integer NOT NULL,
	"format" text DEFAULT 'in_person' NOT NULL,
	"agenda_token" text NOT NULL,
	CONSTRAINT "event_company_event_id_company_id_pk" PRIMARY KEY("event_id","company_id"),
	CONSTRAINT "event_company_agenda_token_unique" UNIQUE("agenda_token")
);
--> statement-breakpoint
CREATE TABLE "intro" (
	"id" text PRIMARY KEY NOT NULL,
	"talent_id" text NOT NULL,
	"company_id" text NOT NULL,
	"need_card_id" text,
	"pick_id" text,
	"initiated_by" text NOT NULL,
	"status" text NOT NULL,
	"request_pairs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request_note" text,
	"organiser_decision" jsonb,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"revealed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_match" (
	"id" text PRIMARY KEY NOT NULL,
	"talent_id" text NOT NULL,
	"job_id" text NOT NULL,
	"card_version" integer NOT NULL,
	"feed_position" integer DEFAULT 0 NOT NULL,
	"body" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"date" text NOT NULL,
	"format" text NOT NULL,
	"place" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"slot_minutes" integer DEFAULT 15 NOT NULL,
	"buffer_minutes" integer DEFAULT 5 NOT NULL,
	"max_meetings_per_talent" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pick" (
	"id" text PRIMARY KEY NOT NULL,
	"digest_id" text NOT NULL,
	"company_id" text NOT NULL,
	"need_card_id" text NOT NULL,
	"need_card_version" integer NOT NULL,
	"talent_id" text NOT NULL,
	"card_version" integer NOT NULL,
	"origin" text DEFAULT 'agent' NOT NULL,
	"body" jsonb NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"selection" jsonb,
	"reason_code" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_note" (
	"id" text PRIMARY KEY NOT NULL,
	"talent_id" text,
	"kind" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"esco_uri" text,
	"until" timestamp with time zone,
	"by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"kind" text NOT NULL,
	"text_version" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "llm_call" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"first_token_ms" integer,
	"tokens_in" integer,
	"tokens_out" integer,
	"ok" boolean NOT NULL,
	"error" text,
	"guard" text
);
--> statement-breakpoint
CREATE TABLE "job_queue" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"done_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_skill" ADD CONSTRAINT "job_skill_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "need_card" ADD CONSTRAINT "need_card_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "need_card" ADD CONSTRAINT "need_card_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview" ADD CONSTRAINT "interview_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_event" ADD CONSTRAINT "interview_event_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal" ADD CONSTRAINT "signal_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal" ADD CONSTRAINT "signal_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_card" ADD CONSTRAINT "signal_card_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_identity" ADD CONSTRAINT "talent_identity_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_language" ADD CONSTRAINT "talent_language_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn" ADD CONSTRAINT "turn_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_intro_id_intro_id_fk" FOREIGN KEY ("intro_id") REFERENCES "public"."intro"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest" ADD CONSTRAINT "digest_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest" ADD CONSTRAINT "digest_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility" ADD CONSTRAINT "eligibility_need_card_id_need_card_id_fk" FOREIGN KEY ("need_card_id") REFERENCES "public"."need_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility" ADD CONSTRAINT "eligibility_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_company" ADD CONSTRAINT "event_company_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_company" ADD CONSTRAINT "event_company_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intro" ADD CONSTRAINT "intro_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intro" ADD CONSTRAINT "intro_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intro" ADD CONSTRAINT "intro_need_card_id_need_card_id_fk" FOREIGN KEY ("need_card_id") REFERENCES "public"."need_card"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intro" ADD CONSTRAINT "intro_pick_id_pick_id_fk" FOREIGN KEY ("pick_id") REFERENCES "public"."pick"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_match" ADD CONSTRAINT "job_match_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_match" ADD CONSTRAINT "job_match_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick" ADD CONSTRAINT "pick_digest_id_digest_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick" ADD CONSTRAINT "pick_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick" ADD CONSTRAINT "pick_need_card_id_need_card_id_fk" FOREIGN KEY ("need_card_id") REFERENCES "public"."need_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick" ADD CONSTRAINT "pick_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_note" ADD CONSTRAINT "pool_note_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "esco_concept_type_idx" ON "esco_concept" USING btree ("type");--> statement-breakpoint
CREATE INDEX "esco_concept_label_en_trgm" ON "esco_concept" USING gin ("label_en" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "esco_concept_label_fi_trgm" ON "esco_concept" USING gin ("label_fi" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "esco_occupation_skill_skill_idx" ON "esco_occupation_skill" USING btree ("skill_uri");--> statement-breakpoint
CREATE UNIQUE INDEX "job_source_uq" ON "job" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "job_active_idx" ON "job" USING btree ("active");--> statement-breakpoint
CREATE INDEX "job_municipality_idx" ON "job" USING btree ("municipality_code");--> statement-breakpoint
CREATE INDEX "job_occupation_gin" ON "job" USING gin ("esco_occupation_uris");--> statement-breakpoint
CREATE INDEX "job_skill_gin" ON "job" USING gin ("esco_skill_uris");--> statement-breakpoint
CREATE INDEX "job_search_gin" ON "job" USING gin ("search");--> statement-breakpoint
CREATE INDEX "job_title_trgm" ON "job" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "job_skill_skill_idx" ON "job_skill" USING btree ("skill_uri");--> statement-breakpoint
CREATE UNIQUE INDEX "need_card_job_uq" ON "need_card" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "need_card_company_idx" ON "need_card" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "interview_talent_idx" ON "interview" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "interview_event_interview_idx" ON "interview_event" USING btree ("interview_id","id");--> statement-breakpoint
CREATE INDEX "signal_esco_idx" ON "signal" USING btree ("esco_uri");--> statement-breakpoint
CREATE INDEX "signal_status_idx" ON "signal" USING btree ("status");--> statement-breakpoint
CREATE INDEX "signal_phrase_trgm" ON "signal" USING gin ("phrase" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "turn_interview_index_uq" ON "turn" USING btree ("interview_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_item_intro_uq" ON "agenda_item" USING btree ("intro_id");--> statement-breakpoint
CREATE INDEX "agenda_item_talent_idx" ON "agenda_item" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "agenda_item_company_idx" ON "agenda_item" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "digest_company_date_uq" ON "digest" USING btree ("company_id","date");--> statement-breakpoint
CREATE INDEX "eligibility_talent_idx" ON "eligibility" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "intro_talent_idx" ON "intro" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "intro_company_idx" ON "intro" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "intro_status_idx" ON "intro" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "job_match_talent_job_uq" ON "job_match" USING btree ("talent_id","job_id");--> statement-breakpoint
CREATE INDEX "notification_recipient_idx" ON "notification" USING btree ("recipient_type","recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pick_digest_need_talent_uq" ON "pick" USING btree ("digest_id","need_card_id","talent_id");--> statement-breakpoint
CREATE INDEX "pick_talent_idx" ON "pick" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "pick_status_idx" ON "pick" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pool_note_talent_idx" ON "pool_note" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "audit_log_subject_idx" ON "audit_log" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "consent_subject_idx" ON "consent" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "llm_call_at_idx" ON "llm_call" USING btree ("at");--> statement-breakpoint
CREATE INDEX "job_queue_ready_idx" ON "job_queue" USING btree ("done_at","run_after");--> statement-breakpoint
CREATE INDEX "job_queue_dedupe_idx" ON "job_queue" USING btree ("dedupe_key");