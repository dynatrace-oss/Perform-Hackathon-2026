--8<-- "snippets/tenant-id.md"


## 1. Prepare Your Environment

The [GitHub Codespace](https://github.com/features/codespaces){target="_blank"}, you will create within this demo, will automatically set
up a local Kubernetes cluster and deploy the necessary Dynatrace resources. To make this work, you'll need to provide
the below credentials and settings.

- A [Dynatrace API token](https://docs.dynatrace.com/docs/dynatrace-api/basics/dynatrace-api-authentication#dynatrace-api-tokens-and-authentication){target="_blank"}
to generate [other tokens used in this demo](https://github.com/Dynatrace/obslab-predictive-kubernetes-scaling/blob/main/dynatrace/tokens.tf){target="_blank"}. Permissions:
    - `apiTokens.read`
    - `apiTokens.write`
- A [Dynatrace OAuth 2.0 client](https://docs.dynatrace.com/docs/platform-modules/automations/cloud-automation/setup-cloud-automation/authentication#client){target="_blank"}
to deploy the workflows and notebook used in this demo. Permissions:
    - `app-settings:objects:read` 
    - `automation:workflows:write`
    - `automation:workflows:read`
    - `automation:workflows:run`  
    - `app-engine:edge-connects:connect`
    - `app-engine:edge-connects:write`
    - `app-engine:edge-connects:read`
    - `app-engine:edge-connects:delete`
    - `davis-copilot:conversations:execute`  
    - `davis-copilot:nl2dql:execute` 
    - `davis-copilot:dql2nl:execute`
    - `davis:analyzers:read` 
    - `davis:analyzers:execute` 
    - `email:emails:send` 
    - `document:documents:write`
    - `document:documents:read`
    - `document:documents:delete`
    - `oauth2:clients:manage`
    - `settings:objects:read`
    - `settings:objects:write`
    -  `storage:buckets:read` 
    -  `storage:logs:read` 
    -  `storage:metrics:read`
    -  `storage:bizevents:read` 
    -  `storage:spans:read` 
    -  `storage:entities:read` 
    -  `storage:events:read` 
    -  `storage:security.events:read`
    -  `storage:system:read` 
    -  `storage:user.events:read` 
    -  `storage:user.sessions:read`
    -  `storage:smartscape:read` 
    -  `storage:events:write` 

- A Dynatrace [Platform token](https://docs.dynatrace.com/docs/manage/identity-access-management/access-tokens-and-oauth-clients/platform-tokens){target=_blank} to trigger the Davis CoPilot from the demo workflow. Permissions:
    - `davis-copilot:conversations:execute`
- [Allow an outbound connection from Dynatrace](https://developer.dynatrace.com/develop/functions/allow-outbound-connections/){target="_blank"}
  to `api.github.com` so that the demo workflow can communicate with GitHub.

!!! info "Wait for GitHub to Index Your Fork"
    The Dynatrace workflow relies on GitHub search functionality. Therefore it is important to wait until GitHub search has indexed your fork.

    To test this, try searching your fork for `predictive-kubernetes-scaling.observability-labs.dynatrace.com`

    If you get a warning: `⚠️ This repository's code is being indexed right now. Try again in a few minutes.` you should not proceed.

    Wait until the search completes successfully, then proceed.

## 2. Create Your Development Environment

--8<-- "snippets/codespace-details-warning-box.md"

- Fork [this repository](https://github.com/dynatrace-oss/Perform-Hackathon-2026/tree/main){target="_blank"} to your GitHub account. This will allow you to make changes and submit pull requests
  later on.
- Create a new Codespace
    - Go to [https://codespaces.new](https://codespaces.new){target=_blank}
    - Set the `repository` to your forked repo
    - Complete the variables requested in the form
    - Click `Create Codespace`
- Wait for the Setup to complete. The Codespace will run a `postCreate` command to initialize your environment. This may
  take a few minutes. You'll know it's ready when the `zsh` shell is shown again.
    - If you want to check the progress, you can press `Ctrl + Shift + P` and type `Creation Log` to see the setup logs
      once the Codespace has initialized.

## 3. Explore What Has Been Deployed

Your Codespace has now deployed the following resources:

- A local Kubernetes ([kind](https://kind.sigs.k8s.io/){target="_blank"}) cluster monitored by Dynatrace, with some pre-deployed apps
  that will be used later in the demo.
- Three [Dynatrace workflows](https://www.dynatrace.com/platform/workflows/){target="_blank"}:
    - **Predict Kubernetes Resource Usage**: This workflow predicts the future resource usage of Kubernetes workloads
      using Davis predictive AI. If a workload is likely to exceed its resource quotas, the workflow creates a custom
      Davis event with all necessary information.
    - **Commit Davis Suggestions**: Triggered by the predictive workflow's events, this workflow uses Davis CoPilot and
      the GitHub for Workflows app to create pull requests for remediation suggestions.
    - **React to Resource Saturation**: If the prediction actually misses some resource spikes, this workflow will get
      alerted via the automatically created Davis problem and will trigger the prediction workflow to immediately react
      and create a pull request. This workflow is disabled by default to avoid unwanted triggers of the prediction
      workflow.


## 4. Grab a Coffee

Before moving on, Davis AI needs around 20 minutes to analyze your Kubernetes workloads and establish a baseline for
predictive analysis. You can check its progress by navigating to the newly deployed "Predictive Kubernetes Scaling"
notebook and running the DQL query in the "2. Predict Resource Usage" step. If the results indicate that Davis AI is
ready, you can proceed to [step 5](#5-generate-some-load).

Just make sure that your Codespace does not expire within that time by e.g. clicking into the window from time to time.
Check out the [GitHub Codespace documentation](https://docs.github.com/en/codespaces/setting-your-user-preferences/setting-your-timeout-period-for-github-codespaces){target="_blank"}
to read more about timeout periods for Codespaces and how to configure them.

## Start Demo

=== "Run in Cloud"

    Click this button to launch the demo in a new tab.

    [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/isItObservable/servicemeshsecuritybenchmark.git){target=_blank}

=== "Run Locally"
* Clone the repository to your local machine

    ```
    git clone -b V3-Workshop --single-branch https://github.com/isItObservable/servicemeshsecuritybenchmark.git
    ```

    * Open the folder in Visual Studio code
    * Ensure the [Microsoft Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers){target=_blank} and [Dev Containers CLI](https://code.visualstudio.com/docs/devcontainers/devcontainer-cli#_installation){target=_blank} are installed in VSCode
    * Open a new terminal in VSCode and set your environment variables as appropriate:

    ```
    set DYNATRACE_ENVIRONMENT_ID=abc12345
    set DYNATRACE_ENVIRONMENT=live
    set DYNATRACE_API_TOKEN=dt0c01.******.***********
    set DYNATRACE_PLATFORM_TOKEN=dt0c01.******.***********
    set DYNATRACE_OAUTH_CLIENT_ID=****
    set DYNATRACE_OAUTH_CLIENT_SECRET=******
    ```

    * Start Docker / Podman
    * Create the environment

    ```
    devcontainer up
    ```

    It will take a few moments but you should see:

    ```
    {"outcome":"success","containerId":"...","remoteUser":"root","remoteWorkspaceFolder":"/workspaces/servicemeshsecuritybenchmark"}
    ```

    * Connect to the demo environment. This will launch a new Visual Studio Code window
    ```
    devcontainer open
    ```

    In the new Visual Studio code window, open a new terminal and continue with the tutorial.

<div class="grid cards" markdown>
- [Click Here to Run the Demo :octicons-arrow-right-24:](workshop.md)
</div>