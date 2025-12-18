<h1 align="center">🧩 CrazyWalk-Game</h1>

<p align="center">
  <b>CrazyWalk</b> is a geolocation-based exploration and territory capture game.<br/>
  Navigate real-world streets, collect items, and complete polygons to expand your map.<br/>
  Powered by OpenStreetMap • Python Backend • Pure HTML/JS Frontend<br/>
</p>

<p align="center">
  <!-- GitHub badges -->
  <a href="https://github.com/israice/CrazyWalk-Game/stargazers">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/israice/CrazyWalk-Game?style=for-the-badge&logo=github" />
  </a>
  <a href="https://github.com/israice/CrazyWalk-Game/forks">
    <img alt="GitHub forks" src="https://img.shields.io/github/forks/israice/CrazyWalk-Game?style=for-the-badge&logo=github" />
  </a>
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/israice/CrazyWalk-Game?style=for-the-badge" />
  <img alt="Visitor Badge" src="https://visitor-badge.laobi.icu/badge?page_id=israice.CrazyWalk-Game" />
</p>


## 🚀 Live Website

> **Try it instantly:**  
> https://crazywalk.weforks.org/

### Last Dev Update
- v0.0.19 - added buttons to menu when activated
<div align="center">
  <img src="CORE/DATA/DEV_SCREENSHOTS/v0.0.10-1.png" alt="Dashboard" height="300">
  <img src="CORE/DATA/DEV_SCREENSHOTS/v0.0.19-1.png" alt="Dashboard" height="300">
  <img src="CORE/DATA/DEV_SCREENSHOTS/v0.0.19-2.png" alt="Dashboard" height="300">
  <img src="CORE/DATA/DEV_SCREENSHOTS/v0.0.19-3.png" alt="Dashboard" height="300">
</div>

<!-- ---------------------- -->
[CrazyWalk Roadmap](https://github.com/israice/CrazyWalk-Game/blob/master/ROADMAP.md)
<!-- ---------------------- -->

<details open>

  <summary>Dev</summary>


- <details>

  <summary>Development Setup</summary>

  ### On Windows or Linux
  ```Bash
  # On Windows start the DOCKER SOFTWARE FIRST!
  git clone https://github.com/israice/CrazyWalk-Game.git
  cd CrazyWalk-Game
  docker compose -f docker-compose.dev.yml up --build
  ```
  ```Bash
  # or run using python
  git clone https://github.com/israice/CrazyWalk-Game.git
  cd CrazyWalk-Game
  python server.py
  ```

  </details>

<!-- ---------------------- -->

- <details>
  <summary>Production Setup</summary>

  ## For Linux
  ```Bash
  # Step 1 - install cloudflared and login
  ```
  ```Bash
  # Step 2 - Link the DNS record
  ## TUNNEL NAME: myTunnelName
  ## SUBDOMAIN: mySubdomain
  ## DOMAIN: myDomain

  cloudflared tunnel create myTunnelName-tunnel

  cloudflared tunnel route dns myTunnelName-tunnel mySubdomain.myDomain.com
  ```
  ```Bash
  # Step 3 - add subdomain and port to config.yml
  cd ~/.cloudflared/
  nano config.yml
  ```
  ```Bash
  - hostname: crazywalk.weforks.org
    service: http://10.0.0.5:80
  ```


  ```Bash
  # Step 4 - restart cloudflared
  docker restart cloudflared
  ```
  ```Bash
  # Step 5 - Enter "Your Projects" folder first, then run the docker
  git clone https://github.com/israice/CrazyWalk-Game.git
  cd CrazyWalk-Game
  docker compose -f docker-compose.prod.yml up --build -d
  ```
  ```Bash
  # Resault
  https://crazywalk.weforks.org
  ```

  </details>

<!-- ---------------------- -->

- <details>
  <summary>GitHub Webhook Setup</summary>

  ## Configure Webhook in GitHub

  1. Go to your repository settings on GitHub.
  2. Click on **Webhooks** -> **Add webhook**.
  3. **Payload URL**: `https://crazywalk.weforks.org/push_and_update_server`
  4. **Content type**: `application/json`.
  5. **Secret**: Generate a strong secret and add it to your `.env` file or environment variables as `AUTOUPDATE_WEBHOOK_FROM_GITHUB`.
  6. **Which events would you like to trigger this webhook?**: Select "Just the push event".
  7. Click **Add webhook**.

  ## Server Configuration

  Ensure your `docker-compose.prod.yml` has the `AUTOUPDATE_WEBHOOK_FROM_GITHUB` environment variable set. You can pass it when running docker compose:

  ```Bash
  # inside .env file
  AUTOUPDATE_WEBHOOK_FROM_GITHUB="your_secret_here" 
  ```
  ```Bash
  docker compose -f docker-compose.prod.yml up -d --build
  ```
  </details>

<!-- ---------------------- -->

- <details>
  <summary>Dev Cheetsheet</summary>

  ## dev icons

  ✅ ☑️ ✔️ ✳️ ❌ ❎ ✖️ 🔁 🔂 🔄
  🚀 ⚙️ 💻 🔥 🧪 🐞 📝 🛠️ 🔄 🕒
  📈 📉 🗂️ 📦 🎯 📚 🧰 🏁 🔔 💡
  🛑 🔍 🏗️ 🧩 🧭 🛡️ 🍀 🌐 📢 🧯
  🛫 🎉 🧿 🖥️ 💾 🧬 🧑‍💻 🧑‍🔬 📊 📋
  📌 📎 🖱️ 🖨️ 🗃️ 📂 🗒️ 🛒 🧹 🖊️
  🗑️ 🕹️ 🧲 🧱 🏷️ 🏆 🥇 📜 📅 🗓️ 
  🔒 🔓 🗝️ 🧊 🧞 🧺 🧳 📡 🏢 🏭
  🏠 🏘️ 🏚️ 🌟 🎨 🧡 💙 💚 💛 💜
  🩵 🩷 🔋 🧨 🧤 🧦 🧥 🧢 🧴 🧵
  🧶 🛎️ 🛏️ 🛋️ 🚪 🚧 🚦 🚥 🚨 🚒
  🚑 🚓 🗄️ 🗳️ 📫 📪 📬 📭 📮 📨
  📩 📤 📥 📧 🔬 🔭 🕵️‍♂️ 🕵️‍♀️ 🧑‍🏫 🔗
  🧑‍🔧 🧑‍🔩 🧑‍🎨 🧑‍🚀 🧑‍✈️ 🧑‍🚒 🧑‍⚕️ 🧑‍🎤 🔨 🔧
  🔩 🗜️ 🖲️ 💾 💿 📀 📼 🧫 ⚡ 🌀
  🌪️ 🛸 🎲 🎮 🐛 🐜 🦠 ⏫ ⏬ ⏩
  ⏪ ⏭️ ⏮️ 🆗 🆕 🆙
  🪙 🪙 💰 💴 💵 💶 💷 💸 💳 🏦
  ⚠️ ❗ ❕ ❓ ❔ ℹ️ ♻️ ⛔ 🚫
  ⬆️ ⬇️ ⬅️ ➡️ ↗️ ↘️ ↙️ ↖️ ⤴️ ⤵️ 
  ↩️ ↪️ 🔼 🔽 ▶️ ⏯️ ⏸️ ⏹️ ⏺️ ⏏️ 
  ◀️ 🔀 🔃 🔙 🔚 🔛 🔜 🔝 ➕ ➖ 
  ➗ ✴️ ❇️ ✨ ⭐ 🟢 🟡 🔴 🔵 ⚪
  ⚫ 🟣 🟤 🟧 🟥 🟦 🟩 🟨 🟪 🟫
  ⬛ ⬜ ◼️ ◻️ ◽ ◾ 💬 🗨️ 🗯️ 📞 
  ☎️ 📱 📲 📳 🔕 🔇 🔈 🔉 🔊 🎙️ 
  🎚️ 🎛️ 🎧 📺 📻 📄 📃 📑 🧾 📰
  🗞️ 📁 📇 🖇️ 📍 🧷 ✂️ 📏 📐 🧮 
  🖋️ 🖌️ ⌨️ 💽 🔌 🔦 🛜 📶 🛰️ ☁️ 
  🌩️ 🌫️ 🌤️ 🛢️ ⚗️ 🗺️ 🔑 🧠 🤖 🐧 
  🐳 🧼 🧽 🪣 🪛 🪚 🪓 🪜 🪝 🪄 
  🪟 🪠 🪪 🪫 🏧 💱 💲 🖧 🪬 🛍️

  ## start or update server
  ```Bash
  docker compose -f docker-compose.dev.yml up --build -d
  docker compose -f docker-compose.prod.yml up --build -d
  ```

  ## stop server
  ```Bash
  docker compose -f docker-compose.dev.yml down
  docker compose -f docker-compose.prod.yml down
  ```

  ## hard reset and rollback to previous commit

  ```Powershell
  git log --oneline -n 10
  ```
  ```Powershell
  Copy-Item .env $env:TEMP\.env.backup
  git reset --hard ab3cf36
  git clean -fd
  Copy-Item $env:TEMP\.env.backup .env -Force
  git push origin master --force  
  ```

  </details>

<!-- ---------------------- -->

- <details>
  <summary>Dev Logs</summary>

  - [x] v0.0.1 - project folders and files structure created
    - dev since 2022, dev from strach started 12.11.2025 
    - full project step by step flow inside README.md
    - create .gitignore file
    - create github repository
    - project first folders and files structure created
  - [x] v0.0.2 - test hello world docker on local
    - hello world html page created
    - docker compose file created
  - [x] v0.0.3 - prod docker on linux server
    - added setup instructions to README.md
    - test the subdomain crazywalk.weforks.org
  - [x] v0.0.4 - create webhook from github to auto update server docker
    - added webhook server and dockerfile
    - make pull on server to update
  - [x] v0.0.5 - update env in dockerfile build
  - [x] v0.0.6 - make a test commit to make sure server updated
  - [x] v0.0.7 - retest server updated
  - [x] v0.0.8 - A_home_page created with city detection and background map
    - A_home_page maximum zoom fixed to city center
    - A_home_page added pre loading gif in future sponsored by NAME
  - [x] v0.0.9 - if small screen then do not show Iphone image
  - [x] v0.0.10 - Premium UI Overhaul & Mobile-First Redesign
    - README.md updated
  - [x] v0.0.11 - Logo changed
  - [x] v0.0.12 - changed to backend logic for city request
  - [x] v0.0.13 - B_map_page created with geo detection
    - added link to GUEST button 
    - added button of sendwich in right top corner
    - Fix production 404 by enforcing correct server root
    - added user marker on map
    - added GPS icon next to sendwich button
    - marker to center and purple color no borders circle under the marker
  - [x] v0.0.14 - fix real location logic
  - [x] v0.0.15 - 32.05673, 34.76875 logic to GPS icon
    - B_map_page marker added in center of map
    - fix marker so he will not move on map move
  - [x] v0.0.16 - fix URL
  - [x] v0.0.17 - added purple marker circle under the marker
  - [x] v0.0.18 - added top bar as separated component
  - [x] v0.0.19 - added buttons to menu when activated
    - added new version screenshots to README.md
    - more README.md updates
  - [x] v0.0.20 - rotate screen to horizontal when small screen
    - fixed drag map on mobile
    - fixed extended map area buffer
  - [x] v0.0.21 - fixed movile horizontal screen UI do it only when small
    - marker added in center of map
    - all browsers support added
    - fixed CORS error
  - [x] v0.0.22 - added top bar with cocial icons
    - fixed spacing between icons
  - [x] v0.0.23 - created plan for polygons development
  - [x] v0.0.24 - added first polygons on map load
    - fixed Dockerfile
    - fixed blue circles number of white lines
    - fixed colores and placement of user marker
    - fixed marker size
  - [x] v0.0.25 - added keyboard navigation controls
    - fixed keyboard navigation controls
    - circles hide when visited
    - fixed blue circles number as one item
    - fixed group_of_polygons as one item
    - deleted not in use white lines in end of polygons
    - added polygons recreation on GPS activation 
    - added green polygons state as completed 
    - fixed GPS issues 
    - fixed code to github restore 
    - Redis added as docker container
  - [x] v0.0.26 - Redis checked now starting small fixes over map ui

    - fixed layers view of polygon items
    - deleted all lines that not have red line
    - show white lines instead red lines
    - need more green circles
    - fixed space between icons
  - ### Next Tasks


  ## update repository

  ```Bash
  git add .
  git commit -m "v0.0.26 - Redis checked now starting small fixes over map ui"
  git push
  ```

  </details>

</details>