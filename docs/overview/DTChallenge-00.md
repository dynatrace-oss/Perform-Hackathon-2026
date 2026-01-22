#  Launching your Environment

**[Home](../index.md)** - [Next Challenge >](./DTChallenge-01.md)

## Pre-requisites

We assume you have walked through the GitHub CoPilot challenges already and therefore are familiar with CoPilot. 

If you just jump into this challenge then here is everything you need
- A GitHub Account
- Ability to forking this GitHub Repo into your GitHub account
- An option to launch a CodeSpace either on GitHub or on your local machine
- An email that we can use to invite you to our Dynatrace Hackathon tenant

If you decide to run the excercise locally make sure that GitHub Copilot is installed in your IDE and you will also need node.js installed to run the Dynatrace MCP Server locally!

## Introduction

We have prepared this GitHub repository that contains a fully functioning online Las Vegas Casino Web App with several games. You will be able to deploy all services that belong to the app on a Kubernetes Cluster. All services are pre-instrumented with basic OpenTelemetry and the Kubernetes Cluster runs the Dynatrace Operator that sends all data to our shared Dynatrace Hackathon tenant.

Goal of this Hackathon is to leverage CoPilot to improve the instrumentation of your services to better identify any issues. On top of that you can also improve your Dynatrace configuration, e.g: adding dashboards, add SLOs, a Site Reliablity Guardian, workflows ...

## Setup steps to launch your environment

Please execute the following setup steps

### 1: Give us your email so we can invite you to the Dynatrace Hackathon Tenant

Once you are logged in you can open the Launch Pad for the Hackathon where you can find all relevant tokens and additional information you will need to launch your codespace!

### 2: Fork this repository

Fork this repository int your GitHub account

### 3: Execute the CI/CD Pipeline

In your cloned repo navigate to GitHub Actions. Enable workflows for that repo and then  manually trigger the CI/CD Pipeline Workflow. This will build your initial version of the app. This will ensure that all services will be deployed successfully when launching the codespace

Later on the same workflow will be triggered when you make code changes which ensures that any code change will also be deployed and you can see the impact of your improved instrumentation!

### 4: Launch Codespace

Launch the Codespace from your forked repository and provide all the necessary values for the options. You can find all the values in the Launch Pad on our Dynatrace Hackathon Tenant. For reference - these are all the environment variables you need: DYNATRACE_ENVIRONMENT_ID, DYNATRACE_ENVIRONMENT, DYNATRACE_API_TOKEN, DYNATRACE_PLATFORM_TOKEN, DYNATRACE_OAUTH_CLIENT_ID, DYNATRACE_OAUTH_CLIENT_SECRET, DYNATRACE_ACCOUNT_ID.

Wait until the Codespace is fully launched.
If there are any errors please let us know!

You can validate that the codespace is started successfuly by doing a `kubectl get pods -A` to validate that all pods launched successfully. Also open the Kubernets App in Dynatrace and validate that you see a Kubernetes Server that matches the name of your codespace. You can also use the "Kubernetes Cluster" Segment to easily filter for your cluster!

Note: After starting your codespaces you may see a popup that requests you to sign in again to GitHub. Aftering signing in you may see a poping stating that 'SAML access was not provided. Some GitHub repositories will not be available'. If you see this message you can safely ignore it.

### 5: Launch the Vegas App

Once all is running you should be able to open up the web interface of our deployed app. For that you can simply open the Ports tab in Visual Studio Code and open the Gateway service. 

Now its time to play a game! Enjoy!

### 6: Launch the Dynatrace MCP Server

Our github repo also comes with the Dynatrace MCP Server pre-configured. Whether you run everything in your local IDE or in the CodeSpace's Browser VS Code. You can open the list of extensions and launch the Dynatrace MCP Server.

When you launch it the first time it will prompt you for the URL of the Dynatrace Tenant. Enter the URL to our Hackathon Tenant.

After that the MCP Server will authenticate by opening up a browser tab. Please follow that tab until you are authenticated.

Now we can test if the MCP server works correctly by executing a prompt in CoPilot such as: `What Dynatrace envrionment am I connected to?`

## Success Criteria

You have successfully completed this challenge when you:

- Have successfully deployed your app and played a game!
- Have access to your data in Dynatrace!
- Have validated that the Dynatrace MCP server is also connected successfuly!

## Learning Resources

- [Dynatrace MCP Documentation](https://github.com/dynatrace-oss/dynatrace-mcp)

