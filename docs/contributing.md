# Contributing

## How to Contribute

The Vegas Casino project welcomes contributions! Here's how you can help:

## Areas for Improvement

### Instrumentation
- Add missing OpenTelemetry spans
- Improve trace context propagation
- Add database operation spans
- Enhance span attributes

### Feature Flags
- Add new feature flags
- Implement flag evaluation in services
- Create flag targeting rules
- Test flag variations

### Testing
- Create new Playwright scenarios
- Add k6 test cases
- Improve test coverage
- Add performance benchmarks

### Documentation
- Improve documentation clarity
- Add examples and tutorials
- Fix typos and errors
- Add diagrams and visuals

## Development Workflow

1. **Fork the Repository**
2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/my-improvement
   ```
3. **Make Changes**
4. **Test Your Changes**
   ```bash
   make docker-build-all
   make test-all
   ```
5. **Commit Changes**
   ```bash
   git commit -m "Add: description of changes"
   ```
6. **Push and Create Pull Request**

## Code Style

- Follow language-specific style guides
- Add comments for complex logic
- Include error handling
- Write meaningful commit messages

## Testing Requirements

- All new features should include tests
- Playwright tests for UI changes
- k6 tests for API changes
- Unit tests for service logic

## Documentation

- Update relevant documentation
- Add examples for new features
- Keep architecture diagrams current
- Update deployment guides if needed

## Questions?

Feel free to open an issue or start a discussion!

---

**Thank you for contributing to Vegas Casino!** 🎰




