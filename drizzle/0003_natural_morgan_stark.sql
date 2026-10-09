CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`booking_id` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	`channel` text DEFAULT 'none' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`delivery_status` text DEFAULT 'pending' NOT NULL,
	`provider_id` text,
	`delivery_error` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient_created` ON `notifications` (`recipient`,`created_at`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `decision_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `quoted_total` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `notify_via` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `alert_consent_at` text;--> statement-breakpoint
CREATE INDEX `idx_bookings_car_status_dates` ON `bookings` (`car_id`,`status`,`start_date`,`end_date`);