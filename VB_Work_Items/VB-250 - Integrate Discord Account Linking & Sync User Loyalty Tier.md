# VB-250: Integrate Discord Account Linking & Sync User Loyalty Tier

## Properties
- State: In Review
- Priority: high
- Identifier: VB-250
- Assignees: user://357d872b-594c-812f-a03d-00028d4f8082
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Updated on: 2026-05-26 08:05:39Z
- Notion URL: https://app.notion.com/345509790d9a809c8eeafd843d165078

## Description
Description:
Allow users to connect their Discord account with the platform. Once connected, the user’s loyalty tier (e.g., Bronze, Silver, etc.) should be automatically synced to Discord and displayed as one of the user’s roles on the server.

The connection entry point should be available on the Discord server. Once user starts connecting, vegasbonanza.com/discauth page is opened. User can there log in to his account via email+pw, Google, or Facebook auth. If user logs in successfully, vegasbonanza.com/lobby is opened, and we return the information back to the Discord bot - that user logged in (he is the owner of the account), and we send the user’s loyalty tier which then creates the role on the server. 

Each role should also show the loyalty tier icon in the Server (Bronze, Silver, etc.).

For specific details about the bot, please contact  

 is granted with staff permissions in Discord so please ask him to needed permission to implement this

Context:
https://support.discord.com/hc/en-us/articles/8063233404823-Connections-Linked-Roles-Community-Members#h_01GK285ENTCX37J9PYCM1ADXCH
https://docs.discord.com/developers/topics/oauth2
https://docs.discord.com/developers/tutorials/configuring-app-metadata-for-linked-roles

Analytic Events:
  • discordAuthViewed
      ◦ discord_user_id
  • discordAuthStarted
      ◦ discord_user_id
  • discordAuthError
      ◦ error - message

Acceptance Criteria:
  • Users can connect/link their Discord account
  • Connection starts from the Discord channel
  • New page: vegasbonanza.com/discauth is created, and it’s where the connection is happening
  • User can only do one action on /discordauth - log in
  • Logging in from that page opens the Lobby and connects the necessary information to the Discord server, unless user was already connected previously
  • Upon successful connection, the user’s loyalty tier (Bronze, Silver, Gold, etc.) is automatically synced to the discord server and displayed as a role under their username.
  • If the user’s loyalty tier changes on the platform, it is automatically updated on Discord via API.
  • If the connection is revoked (from Discord), the tier role is removed
  • The system must handle OAuth or API errors gracefully, showing appropriate error messages and firing the discordConnectFailed event when applicable.

Additional Details:
• Type: 
• Created by: 
• UX/UI Impact:

Additional Information:

ICE Score: 42

## Page Content
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/cf258ce1-a803-4df5-b560-e2b2526a55f9/image.png?)
