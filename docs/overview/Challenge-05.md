# Convert B-MAD Agent to GitHub Copilot Agent (Bonus)

[< Previous Bonus Challenge](./Challenge-04.md) - **[Home](../index.md)** - [Next Bonus Challenge >](./DTChallenge-04.md)

## Introduction

In this bonus challenge, you will learn how to convert a B-MAD (Breakthrough Method for Agile AI Driven Development) agent into a GitHub Copilot agent. This challenge builds on your knowledge of custom agents from Challenge 04 and demonstrates how to adapt agent frameworks for use with GitHub Copilot.

We'll be converting the [B-MAD Observability Agent](https://github.com/henrikrexed/bmad-observability-agent) - a comprehensive OpenTelemetry observability expert - into a GitHub Copilot agent that can be used directly in your IDE.

## Description

B-MAD agents are structured AI assistants that use workflows, prompts, and specialized capabilities to help with specific domains. The B-MAD Observability Agent provides expert guidance on OpenTelemetry, instrumentation, and observability best practices.

In this challenge, you will:

- **Understand B-MAD Agent Structure**  
  Explore the `.bmad` directory structure, agent definitions, and workflow files to understand how B-MAD agents are organized.

- **Create GitHub Copilot Agent Configuration**  
  Convert the B-MAD agent structure into a GitHub Copilot agent configuration that can be installed and used in VS Code or other supported IDEs.

- **Adapt Workflows for Copilot**  
  Transform B-MAD workflows into Copilot-friendly instructions and capabilities that work within the Copilot chat interface.

- **Test and Validate**  
  Install your converted agent and verify it works correctly with GitHub Copilot.

## Prerequisites

- Completed Challenge 04 (Customizing GitHub Copilot in Your IDE)
- Understanding of GitHub Copilot custom agents
- Familiarity with YAML configuration files
- Access to the [B-MAD Observability Agent repository](https://github.com/henrikrexed/bmad-observability-agent)

## Step-by-Step Instructions

### Step 1: Explore the B-MAD Agent Structure

1. **Clone or explore the B-MAD Observability Agent repository:**
   ```bash
   git clone https://github.com/henrikrexed/bmad-observability-agent.git
   cd bmad-observability-agent
   ```

2. **Examine the `.bmad` directory structure:**
   - Look at `.bmad/agents/o11y-engineer.agent.yaml` - This is the main agent definition
   - Review `.bmad/workflows/` - These contain the workflow definitions
   - Understand how the agent is structured and what capabilities it provides

3. **Key components to identify:**
   - Agent name and description
   - Workflow definitions and their purposes
   - System prompts and instructions
   - Tool integrations (if any)

### Step 2: Understand GitHub Copilot Agent Format

GitHub Copilot agents are defined using a specific format. Review the [Awesome Copilot collection](https://github.com/github/awesome-copilot/tree/main) to see examples of existing Copilot agents.

Key elements of a Copilot agent:
- Agent metadata (name, description, author)
- System instructions
- Example interactions
- Capabilities and limitations

### Step 3: Create the Copilot Agent Configuration

1. **Create a new directory for your Copilot agent:**
   ```bash
   mkdir -p .github/copilot-agents
   ```

2. **Create the agent configuration file** (e.g., `observability-engineer.md`):
   
   Structure the file with:
   - Agent name and description
   - System instructions derived from the B-MAD agent
   - Key workflows converted to natural language instructions
   - Example use cases

3. **Convert B-MAD workflows to Copilot instructions:**
   
   For each workflow in the B-MAD agent, create a section explaining:
   - What the workflow does
   - When to use it
   - What information Copilot needs to execute it
   - Expected outcomes

### Step 4: Adapt Workflows

Convert the B-MAD workflows into Copilot-friendly format:

**Example conversion:**

B-MAD workflow: `*quick-start`
- **Purpose**: Complete observability setup from scratch
- **Copilot instruction**: "When the user asks about setting up observability from scratch, guide them through: 1) Installing OpenTelemetry Collector, 2) Configuring instrumentation, 3) Setting up exporters, 4) Validating the setup"

B-MAD workflow: `*assess-observability`
- **Purpose**: Maturity assessment + improvement roadmap
- **Copilot instruction**: "When assessing observability quality, check for: signal coverage (traces, metrics, logs), semantic convention compliance, cardinality management, production readiness, and operational maturity. Provide a score (0-100) with actionable recommendations."

### Step 5: Create Agent Instructions File

Create a comprehensive instructions file that includes:

1. **Agent Identity:**
   ```markdown
   # Observability Engineer Agent
   
   You are an expert OpenTelemetry observability engineer specializing in:
   - OpenTelemetry Collector configuration
   - Instrumentation best practices
   - Semantic conventions
   - Dynatrace integration
   - Production-grade observability setups
   ```

2. **Core Capabilities:**
   - List the main capabilities from the B-MAD agent
   - Explain how to use each capability
   - Provide examples

3. **Workflow Mappings:**
   - Map each B-MAD workflow to Copilot instructions
   - Include trigger phrases that activate each workflow
   - Provide example interactions

### Step 6: Install and Test the Agent

1. **Install the agent in your IDE:**
   - Follow the instructions from Challenge 04
   - Use the [Awesome Copilot collection](https://github.com/github/awesome-copilot/tree/main) format
   - Or create a local agent configuration

2. **Test key workflows:**
   - Try asking about observability setup
   - Request an observability assessment
   - Ask for help with OpenTelemetry Collector configuration
   - Test semantic convention validation

3. **Validate responses:**
   - Ensure the agent provides accurate, helpful guidance
   - Verify it references OpenTelemetry best practices
   - Check that it suggests appropriate tools and approaches

### Step 7: Enhance with Project Context (Optional)

If you want to make the agent specific to the Vegas Casino application:

1. **Add project-specific context:**
   - Reference the Vegas Casino architecture
   - Include service-specific instrumentation examples
   - Add Dynatrace tenant information

2. **Create custom workflows:**
   - Instrumentation for specific services (slots, roulette, dice, blackjack)
   - Vegas Casino-specific observability patterns
   - Integration with the existing Dynatrace setup

## Success Criteria

You will have successfully completed this challenge when you:

- ✅ Created a GitHub Copilot agent configuration file based on the B-MAD Observability Agent
- ✅ Converted at least 3 B-MAD workflows into Copilot-friendly instructions
- ✅ Installed and activated the agent in your IDE
- ✅ Demonstrated the agent working by asking it observability-related questions
- ✅ Showed that the agent provides relevant, helpful guidance

## Example Interactions

Here are some example interactions you should be able to have with your converted agent:

**User:** "How do I know if my observability is good?"

**Agent:** *Provides a comprehensive assessment covering signal coverage, semantic conventions, cardinality, production readiness, and gives a quality score with recommendations*

**User:** "I need to set up OpenTelemetry from scratch"

**Agent:** *Guides through the complete setup process: collector installation, instrumentation configuration, exporter setup, and validation*

**User:** "My collector keeps crashing"

**Agent:** *Helps diagnose the issue by checking configuration, resource limits, pipeline design, and provides specific fixes*

## Learning Resources

- [B-MAD Observability Agent Repository](https://github.com/henrikrexed/bmad-observability-agent)
- [GitHub Copilot Custom Agents Documentation](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-personal-instructions)
- [Awesome Copilot Collection](https://github.com/github/awesome-copilot/tree/main)
- [VS Code Chat Modes and Custom Agents](https://code.visualstudio.com/docs/copilot/copilot-chat)
- [B-MAD Method Documentation](https://github.com/github/awesome-copilot) (if available)

## Tips

- Start by converting the most commonly used workflows first
- Keep the agent instructions concise but comprehensive
- Test each workflow conversion individually
- Use examples from the B-MAD agent repository as reference
- Consider creating a hybrid approach that references both B-MAD workflows and Copilot capabilities

---

**Ready to convert?** Start by exploring the [B-MAD Observability Agent](https://github.com/henrikrexed/bmad-observability-agent) repository!
