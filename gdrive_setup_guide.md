# How to Obtain Google Drive API Credentials

To integrate Google Drive with your CRM, you need to create a **Service Account** in the Google Cloud Console. Follow these steps:

## 1. Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click on the project dropdown at the top and select **"New Project"**.
3. Give it a name (e.g., `Bharat Properties CRM`) and click **"Create"**.

## 2. Enable Google Drive API
1. In the sidebar, go to **APIs & Services > Library**.
2. Search for **"Google Drive API"**.
3. Click on it and then click **"Enable"**.

## 3. Create a Service Account
1. Go to **APIs & Services > Credentials**.
2. Click **"+ CREATE CREDENTIALS"** and select **"Service account"**.
3. Enter a name (e.g., `drive-uploader`) and click **"CREATE AND CONTINUE"**.
4. In the "Grant this service account access to project" section, you can skip roles or select **"Editor"** (optional for this specific use case, but may be helpful). Click **"CONTINUE"**.
5. Click **"DONE"**.

## 4. Generate JSON Key
1. In the **Service Accounts** list, click on the email of the account you just created.
2. Go to the **"Keys"** tab.
3. Click **"ADD KEY" > "Create new key"**.
4. Select **JSON** and click **"Create"**.
5. A JSON file will be downloaded to your computer. **Keep this file safe!** 

## 5. Get the Folder ID
1. Go to your Google Drive.
2. Create a new folder where you want the CRM files to be stored (e.g., `CRM Uploads`).
3. Open the folder and look at the URL. It will look like: 
   `https://drive.google.com/drive/folders/ABC_123_XYZ`
4. The part after `/folders/` (in this case `ABC_123_XYZ`) is your **Folder ID**.

## 6. Share the Folder with the Service Account
1. Right-click your new folder in Google Drive and select **"Share"**.
2. Copy the `client_email` from the JSON key file you downloaded in Step 4.
3. Paste that email into the share box and give it **"Editor"** permissions.
4. Click **"Send"**.

## 7. Provide the Information to the CRM
You will need to provide the following values from your JSON file and Drive folder:
- `client_email` (from JSON)
- `private_key` (from JSON)
- `folder_id` (the one you copied in Step 5)
