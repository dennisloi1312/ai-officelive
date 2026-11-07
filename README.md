# AI Office

A static, live 3D office for GitHub Pages. Each team gets a floor. Each bot is a small low-poly character that types, waits, wanders, or sleeps based on messages posted to an [ntfy.sh](https://ntfy.sh) topic.

There is no build step. Pages serves this repository as-is. The page loads [three.js](https://github.com/mrdoob/three.js) (MIT) as ES modules from jsDelivr and talks to **no host except `ntfy.sh`**.

## Watch a live office

Open the site with the topic in the URL hash:

```text
https://dennisloi1312.github.io/ai-officelive/#your-topic
```

The topic must match `^[A-Za-z0-9_-]{6,64}$`. With no hash, or with a hash that is not a topic, the page shows a sample office and a short note.

**The link is a secret.** Anyone who has it can read the stream, and a public ntfy topic can also be written by anyone who knows its name. Do not share the URL, the hash, or screenshots that include it. Browsers do not send the hash to GitHub Pages. This page sends the topic only to `https://ntfy.sh`.

## Message formats

Post each update as one JSON object. The ntfy message body **is** that JSON (it is not wrapped again). The page replays messages from the last 12 hours, then keeps a live stream.

Roster (bots missing from the latest roster disappear):

```json
{"roster":["Kai","研究｜文獻研究員"]}
```

Team for each bot. Ops is the ground floor. Every other distinct team gets its own floor, in a stable order, up to six floors:

```json
{"groups":{"Kai":"Ops","研究｜文獻研究員":"Research"}}
```

Look. `shape` is one of `sphere`, `rounded_cube`, `pill`, `triangle`, `cone`, `pentagon`, `hexagon`, `star4`, `star6`, `clover`, `rounded_square`, `trio`. `accessory` is one of `none`, `glasses`, `stem`, `antenna`, `bow`. `color` is a hex color. Unknown values fall back quietly.

```json
{"looks":{"Kai":{"shape":"sphere","color":"#1E86FC","accessory":"antenna"}}}
```

Live status. `status` is `working`, `idle`, `waiting_user`, `error`, or `done`. `step` is short text shown in the list and, on hover or tap, in a speech bubble.

```json
{"bot":"Kai","status":"working","step":"Sorting the morning queue"}
```

`working` sits at a desk and types while the screen glows. `idle` wanders, relaxes, or sleeps (a Z floats up). `waiting_user` raises a hand with a `!` bubble. `error` slumps under a red `×`. `done` hops with a sparkle, then settles into idle. A bot left on `working` with no new message for 20 minutes fades to idle.

Optional routines and usage panels appear only after one of these arrives:

```json
{"routines":{"bot":"Kai","items":[{"name":"Inbox sweep","schedule":"every 30 min","next_run":"2026-11-07T09:30:00Z"}]}}
```

```json
{"type":"usage","total_used_pct":37,"resets_at":"2026-11-07T18:00:00Z","bots":{"Kai":4.1}}
```

Names may contain CJK characters and the fullwidth bar `｜`. They are drawn as HTML text, not as 3D glyphs. Every message is treated as untrusted text.

Example:

```bash
TOPIC=your-topic
curl -fsS --data-binary '{"roster":["Kai","研究｜文獻研究員"]}' "https://ntfy.sh/${TOPIC}"
curl -fsS --data-binary '{"groups":{"Kai":"Ops","研究｜文獻研究員":"Research"}}' "https://ntfy.sh/${TOPIC}"
curl -fsS --data-binary '{"looks":{"Kai":{"shape":"sphere","color":"#1E86FC","accessory":"antenna"}}}' "https://ntfy.sh/${TOPIC}"
curl -fsS --data-binary '{"bot":"Kai","status":"working","step":"Sorting the morning queue"}' "https://ntfy.sh/${TOPIC}"
```

## Use the page

Drag to orbit and scroll or pinch to zoom. Reset view frames the whole building. Tap a bot in the room or in the list to focus the camera and read the latest step. Sound is off until you turn it on; the tones are synthesized in the browser. Lighting follows this device’s local time, and the list shows times in that same clock. The last view of a topic is cached in `localStorage` on this device so the room can appear before the network answers.

## Enable GitHub Pages

In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` → Folder: `/ (root)` → Save.**

`.nojekyll` is included so Jekyll does not rewrite the site. After Pages finishes deploying, the office is at `https://<user>.github.io/<repo>/`.

## Local preview

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080/`.

## Privacy

The Content-Security-Policy on the page allows scripts from this site and `https://cdn.jsdelivr.net`, and connections only to `https://ntfy.sh`. Referrers are not sent. There is no analytics, no tracking pixel, and no third-party font download.

## License

MIT © 2026 Loi Fai Lim. See [LICENSE](LICENSE).

three.js is © The three.js Authors and is used under the MIT license from jsDelivr. It is not vendored in this repository.

---

# AI Office（繁體中文）

這是一個給 GitHub Pages 用的靜態、即時 3D 辦公室。每個團隊一層樓。每個機器人是一隻低面數的小角色，會依你貼到 [ntfy.sh](https://ntfy.sh) 主題的訊息，坐在桌前打字、等待、閒逛或睡覺。

不需要建置。Pages 直接提供這個儲存庫的檔案。頁面以 ES module 從 jsDelivr 載入 [three.js](https://github.com/mrdoob/three.js)（MIT），**除了 `ntfy.sh` 之外不連任何主機**。

## 看即時辦公室

把主題放在網址的 hash：

```text
https://dennisloi1312.github.io/ai-officelive/#你的主題
```

主題必須符合 `^[A-Za-z0-9_-]{6,64}$`。沒有 hash，或 hash 不是合法主題時，頁面會顯示一間樣本辦公室和簡短說明。

**這條連結就像密碼。** 拿到它的人都能讀取訊息；公開的 ntfy 主題，只要知道名字也能寫入。請不要分享網址、hash，或含有它的截圖。瀏覽器不會把 hash 傳給 GitHub Pages。這個頁面只會把主題送給 `https://ntfy.sh`。

## 訊息格式

每一則更新都是一個 JSON 物件。ntfy 的訊息本文**就是**這個 JSON，不要再包一層。頁面會先重播最近 12 小時的訊息，再接著即時串流。

名單（不在最新名單裡的機器人會消失）：

```json
{"roster":["Kai","研究｜文獻研究員"]}
```

每個機器人的團隊。Ops 是一樓。其他每個不同的團隊各有一層，順序固定，最多六層：

```json
{"groups":{"Kai":"Ops","研究｜文獻研究員":"Research"}}
```

外觀。`shape` 可以是 `sphere`、`rounded_cube`、`pill`、`triangle`、`cone`、`pentagon`、`hexagon`、`star4`、`star6`、`clover`、`rounded_square`、`trio`。`accessory` 可以是 `none`、`glasses`、`stem`、`antenna`、`bow`。`color` 是十六進位色碼。不認得的值會安靜地退回預設。

```json
{"looks":{"Kai":{"shape":"sphere","color":"#1E86FC","accessory":"antenna"}}}
```

即時狀態。`status` 為 `working`、`idle`、`waiting_user`、`error` 或 `done`。`step` 是短句，會出現在清單裡；滑過或點一下時也會出現在對話泡泡。

```json
{"bot":"Kai","status":"working","step":"Sorting the morning queue"}
```

`working` 坐在桌前打字，螢幕會亮。`idle` 會閒逛、放鬆，或睡覺（飄出一個 Z）。`waiting_user` 舉手並顯示 `!`。`error` 垂下身子，旁邊是紅色 `×`。`done` 會開心跳一下並灑出星光，然後回到 idle。若 `working` 超過 20 分鐘沒有新訊息，會淡出成 idle。

收到下面其中一種訊息時，側欄才會出現例行工作或用量；沒收到就隱藏：

```json
{"routines":{"bot":"Kai","items":[{"name":"Inbox sweep","schedule":"every 30 min","next_run":"2026-11-07T09:30:00Z"}]}}
```

```json
{"type":"usage","total_used_pct":37,"resets_at":"2026-11-07T18:00:00Z","bots":{"Kai":4.1}}
```

名字可以包含中日韓文字和全形直線 `｜`。文字用 HTML 繪製，不是 3D 字。所有訊息都當成不可信的純文字。

範例：

```bash
TOPIC=你的主題
curl -fsS --data-binary '{"roster":["Kai","研究｜文獻研究員"]}' "https://ntfy.sh/${TOPIC}"
curl -fsS --data-binary '{"groups":{"Kai":"Ops","研究｜文獻研究員":"Research"}}' "https://ntfy.sh/${TOPIC}"
curl -fsS --data-binary '{"looks":{"Kai":{"shape":"sphere","color":"#1E86FC","accessory":"antenna"}}}' "https://ntfy.sh/${TOPIC}"
curl -fsS --data-binary '{"bot":"Kai","status":"working","step":"Sorting the morning queue"}' "https://ntfy.sh/${TOPIC}"
```

## 怎麼操作

拖曳可以環繞，滾輪或雙指可以縮放。Reset view 會把整棟樓放回畫面。點房間裡或清單裡的機器人，攝影機會靠過去並顯示最新的 step。音效預設關閉，打開之後由瀏覽器自己合成。光線依這台裝置的本地時間變化，清單上的時間也是同一座時鐘。某個主題最後一次的狀態會存在這台裝置的 `localStorage`，網路回應之前房間就能先出現。

## 啟用 GitHub Pages

在儲存庫裡：**Settings → Pages → Build and deployment → Source 選 Deploy from a branch → Branch 選 `main` → Folder 選 `/ (root)` → Save。**

已附上 `.nojekyll`，Jekyll 不會改寫這個網站。Pages 部署完成後，辦公室在 `https://<user>.github.io/<repo>/`。

## 本機預覽

```bash
python3 -m http.server 8080
```

然後打開 `http://127.0.0.1:8080/`。

## 隱私

頁面上的 Content-Security-Policy 只允許這個網站和 `https://cdn.jsdelivr.net` 的指令碼，連線只允許 `https://ntfy.sh`。不送出 referrer。沒有分析、沒有追蹤圖、也不會下載第三方字型。

## 授權

MIT © 2026 Loi Fai Lim。見 [LICENSE](LICENSE)。

three.js © The three.js Authors，依 MIT 授權從 jsDelivr 載入，沒有把原始碼放進這個儲存庫。
