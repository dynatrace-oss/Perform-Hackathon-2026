# Ownership team resource with unique identifier per codespace
# The identifier includes the codespace name to ensure uniqueness across multiple deployments.
# Format: <demo_name_kebab>-<sanitized_codespace_name>
# Requirements: 1-100 chars, start/end with letter, only letters/numbers/hyphens/underscores
locals {
  # Create unique identifier by combining demo name with codespace name
  # The codespace name will be sanitized in init.sh before being passed as a variable
  # Format: demo_name-codespace_name (both should already be kebab-case)
  # Since demo_name_kebab should start with a letter, the combined identifier should too
  team_identifier = "${var.demo_name_kebab}-${var.codespace_name}"
}

resource "dynatrace_ownership_teams" "demo" {
  name        = "${var.demo_name} [${var.codespace_name}]"
  identifier  = local.team_identifier
  description = "${var.demo_name} demo team for codespace ${var.codespace_name}"

  responsibilities {
    development      = true
    infrastructure   = false
    line_of_business = false
    operations       = true
    security         = false
  }

  lifecycle {
    # Prevent accidental deletion
    prevent_destroy = false
  }
}