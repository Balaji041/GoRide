CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`age` integer NOT NULL,
	`phone` text NOT NULL,
	`car_id` text NOT NULL,
	`car_name` text NOT NULL,
	`location` text NOT NULL,
	`mode` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`created_at` text NOT NULL,
	`consent_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_customer_request` ON `bookings` (`customer_id`,`id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_documents_booking_kind` ON `documents` (`booking_id`,`kind`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`email` text NOT NULL,
	`booking_id` text,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`rating` integer,
	`message` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feedback_booking_review` ON `feedback` (`booking_id`,`kind`);