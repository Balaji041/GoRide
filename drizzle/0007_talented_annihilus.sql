CREATE TABLE `cancellation_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`decision_at` text,
	`decision_note` text DEFAULT '' NOT NULL,
	`decision_version` integer
);
--> statement-breakpoint
CREATE INDEX `idx_cancellation_booking_created` ON `cancellation_requests` (`booking_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cancellation_one_pending` ON `cancellation_requests` (`booking_id`) WHERE "cancellation_requests"."status" = 'pending';