# VB-436: Add Device Model and Device Name to User & Event Properties

## Properties
- State: Todo
- Priority: low
- Identifier: VB-436
- Assignees: user://2e1d872b-594c-8183-b36f-00021573ead3
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Notion URL: https://app.notion.com/36f509790d9a8071bc3deba97e01fc2b

## Description
Description:
Add device model and device name tracking to analytics user properties and event properties to improve device-level analysis, debugging, segmentation, and issue investigation.
The goal is to capture more granular device information for users interacting with the platform.
The following properties should be added:
• device_model - raw device model value
    ◦ Examples:
        ▪ iPhone15,2
        ▪ SM-G991B
        ▪ Pixel 8
• device_name - human-readable/normalized device name if available
    ◦ Examples:
        ▪ Samsung Galaxy S21
        ▪ iPhone
        ▪ Google Pixel 8
Implementation requirements:
• Properties should be attached to analytics events
• Device information should update automatically when available

Context:
N/A

Analytic Events:
N/A

Acceptance Criteria:
  •  device_model is added to analytics event properties
  • device_name is added to analytics event properties
  • Properties are populated correctly on supported devices/platforms
  • Device properties are visible in  Mixpanel

Additional Information:
  • 

ICE Score: 36

## Page Content
### Verified in Dev (#1)
#### Results
ℹ️ Verified on 4 different devices. iPhone, Android, MacBook, and PC with Windows
- 🟢 AC1-2: Passed
	- Verified several events.
	- Both properties are added to events.
- 🔴 AC3-4: Failed
	- Noticed a few unclear/failed points.
	- Mobile device events also have a `device` property, which looks the same as `device_model`.
	- Computer-triggered events do not have the `device` property.
	- Android and PC (Windows OS) do not have correct data.
	- Android values: device_model: K, device_name: (not set)
	- PC values: device_model: (not set), device_name: (not set)
#### Attachments
iPhone
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/b4969568-d111-45d4-aac0-5832fc9ca164/iPhone_double.png?
Android
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/ee36d830-43ef-4b37-bc25-a5221704f9c6/Android.png?
MacBook
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/244127d6-0e92-4549-b8b8-c87ed4cab08e/Mac.png?
PC Windows
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/2e968c71-a026-43c0-b77c-8daf70212089/PC_windows.png?
