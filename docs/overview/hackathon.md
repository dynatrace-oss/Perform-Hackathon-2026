# Hackathon Context

## Purpose

The Vegas Casino project is designed for **observability hackathons** where participants work together to improve instrumentation, observability pipelines, and application monitoring.

## Hackathon Objectives

During the hackathon, attendees will:

### 1. Instrumentation Challenges

- **Add Missing Spans**: Identify and add OpenTelemetry spans for business logic
- **Improve Trace Correlation**: Ensure end-to-end trace propagation across services
- **Enhance Attributes**: Add meaningful attributes to spans for better observability
- **Database Instrumentation**: Add spans for PostgreSQL and Redis operations

### 2. Feature Flag Integration

- **Implement Feature Flags**: Add feature flag evaluation in game services
- **Configure flagd**: Set up and configure flagd sidecar injection
- **Test Flag Variations**: Experiment with different flag states and targeting

### 3. Observability Pipeline

- **Configure Exporters**: Set up OpenTelemetry exporters (HTTP/gRPC)
- **Optimize Data Flow**: Tune collector configuration for performance
- **Add Custom Metrics**: Create custom metrics for business KPIs

### 4. Testing and Validation

- **Create Load Tests**: Write k6 scripts for different scenarios
- **Automate Testing**: Enhance Playwright scripts for comprehensive coverage
- **Validate Traces**: Ensure traces are properly connected and complete

### 5. Deployment and Operations

- **Helm Chart Improvements**: Enhance Helm charts with better configuration
- **Resource Optimization**: Tune resource requests and limits
- **Monitoring Setup**: Configure dashboards and alerts

## Hackathon Structure

### Phase 1: Exploration (30 minutes)
- Understand the architecture
- Explore existing instrumentation
- Identify gaps and opportunities

### Phase 2: Implementation (2-3 hours)
- Work on assigned challenges
- Implement improvements
- Test and validate changes

### Phase 3: Validation (30 minutes)
- Run load tests
- Verify trace completeness
- Review observability data

### Phase 4: Presentation (30 minutes)
- Share improvements made
- Demonstrate trace flows
- Discuss learnings

## Success Criteria

A successful hackathon session should result in:

- ✅ **Complete Trace Coverage**: All user actions produce connected traces
- ✅ **Feature Flag Integration**: Feature flags are evaluated and traced
- ✅ **Database Instrumentation**: All database operations are instrumented
- ✅ **Load Test Results**: k6 tests generate realistic traffic and traces
- ✅ **End-to-End Visibility**: Traces connect from frontend → games → scoring → database

## Getting Started

1. **Clone the Repository**: Get the latest code
2. **Review Architecture**: Understand the system design
3. **Build and Deploy**: Get the application running
4. **Explore Traces**: Check existing instrumentation
5. **Pick a Challenge**: Choose an area to improve
6. **Implement and Test**: Make changes and validate

---

**Ready to start?** Check out the [Architecture](../architecture/index.md) or [Building Guide](../development/building.md).

