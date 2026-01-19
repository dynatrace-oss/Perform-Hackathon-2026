# Ownership team resource
# Note: If the team already exists in Dynatrace, it should be imported first using:
#   terraform import dynatrace_ownership_teams.demo <team_identifier>
# The init.sh script attempts to do this automatically before applying.
resource "dynatrace_ownership_teams" "demo" {
  name        = var.demo_name_kebab
  identifier  = var.demo_name_kebab
  description = "${var.demo_name} demo team"

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