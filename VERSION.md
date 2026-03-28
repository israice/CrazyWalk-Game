

## kill running
npm run dev
npm start

node tools\analyze_calls.js

## stop server
```Bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.prod.yml down
```

## start or update server
```Bash
docker compose -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.prod.yml up --build -d
```


# Recovery
```Powershell
git log --oneline -n 10
```

```Powershell
Copy-Item .env $env:TEMP\.env.backup
git reset --hard d4f780c
git clean -fd
Copy-Item $env:TEMP\.env.backup .env -Force
git push origin master --force
```

## update repository
git add .
git commit -m "v0.0.36 - added screenshots"
git push


# Dev
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
- green circles fixed as polygon percent
- added street names to map
- removed group of polygons area block from zoom out event
- fixed all blue lines showing all exising crossings
- fixed green polygons state as completed when zoom out
- fixed blue circles number as one item
- fixed white circle size
- next tasks plan created in README.md
- added MCPs and skills to antigravity
- version checked
- added Liquid Glass Web Effects to home page
- added more information to debug
- small polygons fixed
- added arrows combination up + left
- added revercing using arrow keys to marker.gif
- fixed combined polygons perimeter
- added city title based ip and geo aproove to guest button
- fixed hidden circles syayment when going back to fake location
- [x] v0.0.27 - added POSTERS instead finished polygons
- fixed posters center
- fixed posters view when polygon finished
- fixed posters on both locations
- added posters randomizer
- testing city fix on home page
- fixed united poligon perimeter
- README.md screenshots version updated
- testting prod 1
- fixed poster colors as original colors
- fixed posters randomaizer and saving between locations
- fixed posters transparety in debug mode
- added orange circles as completed
- added info about polygons to elements in debug popups
- added version title to map inside the game
- added information in polygon popup about near polygons
- removed logic of combine polygons with smalls polygons
- [x] v0.0.28 - added polygons expend logic when player on blue circle
- fixed polygons image when expending polygons
- fixed images of extended polygons
- added promo gif inside polygons
- fixed gif randomizer only on start not after expend
- [x] v0.0.29 - fixed large white circle, now it is the circle in the middle of polygon
- [x] v0.0.30 - fixed as redis only
- debug mode fixed
- [x] v0.0.31 - added save history to redis
- fixed speed of polygon generation and added keyboard enter as GUEST
- added entry sound
- [x] v0.0.32 - fixed restore point of user marker
- fixed restore point of user marker on green circle
- added white line to comleted polygons
- fixed home page
- added sposorship prices to polygons
- [x] v0.0.33 - added user registration and login page
- [x] v0.0.34 - changed to node js from python
- docker prod test with new node changes
- docker prod with new node changes test 2
- docker prod with new node changes test 3
- [x] ## v0.0.35 - completed refactoring
v0.0.36 - added screenshots

