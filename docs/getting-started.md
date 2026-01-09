--8<-- "snippets/tenant-id.md"

## Gather Details: Create API Token

This Workshop requires 2 API tokens:
* One to deploy the Dynatrace Operator
* One to ingest metrics, logs, traces and events

You have been invited to a Dynatrace tenant.

All the relevant applications are displayed on your welcome screen:
<img src="..//images/home_dt.png" width="100%" alt="welcome" />

--8<-- "snippets/api-token.md"

## Gather Details: Create EdgeConnect OAuth Client

EdgeConnect requires an OAuth client to authenticate with your Dynatrace environment. The OAuth client is automatically created when you create an EdgeConnect configuration in Dynatrace.

### Step 1: Create EdgeConnect Configuration

1. Go to **Settings** > **General** > **External Requests** > **EdgeConnect** in your Dynatrace environment.
2. Select **New EdgeConnect**.
3. Enter a unique **Name** for the EdgeConnect instance (e.g., `obs-istio-edgeconnect`).
   - Name must be RFC 1123 Label Names compliant with maximum length of 50 characters
4. Provide the **Host patterns** of the requests that should be handled by the EdgeConnect instance.
   - You can use wildcards to replace the first parts of the host domain (e.g., `*.myapp.org` matches `staging.myapp.org` and `prod.myapp.org`)
   - For Kubernetes automation, you might use patterns like `kubernetes.default.svc.cluster.local` or `*.svc.cluster.local`
5. Select **Create**.

### Step 2: Download EdgeConnect Configuration File

1. After creating the EdgeConnect configuration, download the `edgeConnect.yaml` configuration file.
   - This file contains all the OAuth credentials you need
   - **Important**: The OAuth client secret is only displayed once and cannot be retrieved later
   - Make sure to save this file securely

### Step 3: Extract OAuth Credentials

Open the downloaded `edgeConnect.yaml` file and extract the following values:

```yaml
name: obs-istio-edgeconnect
api_endpoint_host: abc12345.apps.dynatrace.com
oauth:
  endpoint: https://sso.dynatrace.com/sso/oauth2/token
  client_id: dt0s10.your-oauth-client-id
  client_secret: ********  # This is only shown once!
  resource: urn:dtenvironment:abc12345
```

You'll need these values for your environment variables:

- **OAUTH_CLIENT_ID**: The `oauth.client_id` value (e.g., `dt0s10.your-oauth-client-id`)
- **OAUTH_CLIENT_SECRET**: The `oauth.client_secret` value
- **OAUTH_CLIENT_URN**: The `oauth.resource` value (e.g., `urn:dtenvironment:abc12345`)

### Step 4: Verify EdgeConnect Connection

After deploying EdgeConnect (see deployment instructions), validate the connection:

1. Go to **Settings** > **General** > **External Requests** > **EdgeConnect**.
2. Check the **Availability** column. It should display **online**.
   - If it's still offline, check the container logs for error messages.

For more details, see the [Dynatrace EdgeConnect documentation](https://docs.dynatrace.com/docs/ingest-from/edgeconnect#appconfigurations).

### Alternative: Using Dynatrace Operator with Provisioner

If you're using the Dynatrace Operator with `oauth.provisioner: true` in your EdgeConnect custom resource (as shown in `codespace/dynatrace/edge-connect.yaml`), the Operator will automatically create and manage the OAuth client for you. In this case, you don't need to manually create the EdgeConnect configuration in the Dynatrace UI.

--8<-- "snippets/info-required.md"


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
    set DT_ENVIRONMENT_ID=abc12345
    set DT_ENVIRONMENT_TYPE=live
    set DT_API_TOKEN=dt0c01.******.***********
    set DT_OPERATOR_TOKEN=dt0c01.******.***********
    set OAUTH_CLIENT_ID=****
    set OAUTH_CLIENT_SECRET=******
    set OAUTH_CLIENT_URN=*****
    set NAME= <Name of your environment>
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