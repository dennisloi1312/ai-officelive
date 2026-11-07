# AI Office

A static, live 3D office for GitHub Pages. Each team has a floor. Each bot is a small low-poly character that types, wanders, waits, slumps, or hops, following messages on a private [ntfy.sh](https://ntfy.sh) topic.

The page is plain HTML, CSS, and JavaScript. There is no build step. The only library is [three.js](https://github.com/mrdoob/three.js) (MIT), loaded from jsDelivr. The only network calls are to that CDN and, when a topic is in the URL hash, to `https://ntfy.sh`.

## Watch a live office

Open the page with the topic in the hash:

```text
https://<user>.github.io/<repo>/#your-topic-name
```

The topic must match `^[A-Za-z0-9_-]{6,64}$`. Example: `#gbw-XXXXXXXXXXXXXXXXXXXXXX`.

**The link works like a password.** Anyone who has it can read the stream. Do not share it, do not commit it, and do not put it in a screenshot you plan to publish. The page sends the topic only to `ntfy.sh`. It is also kept in `localStorage` on this browser so the last office can appear before the next fetch.

Without a hash, the page shows a demo office and does not contact ntfy.

## Message formats

Publish one JSON object per message. The page treats every field as untrusted text.

Full roster. Bots missing from the latest roster disappear:

```json
{"roster":["Kai","研究｜文獻研究員"]}
```

Team for each bot. Ops is the ground floor. Each distinct team gets its own floor, up to six, in a stable order:

```json
{"groups":{"Kai":"Ops","研究｜文獻研究員":"Research"}}
```

Look. `shape` is one of `sphere`, `rounded_cube`, `pill`, `triangle`, `cone`, `pentagon`, `hexagon`, `star4`, `star6`, `clover`, `rounded_square`, `trio`. `accessory` is one of `none`, `glasses`, `stem`, `antenna`, `bow`. `color` is a `#RRGGBB` hex. Unknown values fall back to a plain character.

```json
{"looks":{"Kai":{"shape":"sphere","color":"#1E86FC","accessory":"antenna"}}}
```

Live status. `status` is `working`, `idle`, `waiting_user`, `error`, or `done`. `step` is short text shown in the roster and, on hover or tap, above the bot.

```json
{"bot":"Kai","status":"working","step":"checking the deploy"}
```

Working bots sit and type while the screen glows. Idle bots nap or wander. Waiting bots raise a hand with a `!`. Errors slump under a red `×`. Done bots hop and sparkle, then rest. A bot left on `working` for 20 minutes with no new message fades to idle.

Optional routines. The card stays hidden until one of these arrives:

```json
{"routines":{"bot":"Kai","items":[{"name":"Morning digest","schedule":"0 9 * * 1-5","next_run":"2026-11-08T09:00:00Z"}]}}
```

Optional usage:

```json
{"type":"usage","total_used_pct":37,"resets_at":"2026-12-01T00:00:00Z","bots":{"Kai":4.1}}
```

Names may include CJK characters and the fullwidth bar `｜`. Labels are HTML text, not drawn as WebGL fonts, so those characters stay readable.

On load the page fetches `https://ntfy.sh/<topic>/json?poll=1&since=12h`, then follows `https://ntfy.sh/<topic>/sse`, catching up with `since=<last id>` after a reconnect.

## Enable GitHub Pages

1. Push this repository to the branch you want to publish (`main`).
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **main** and folder **/ (root)**, then save.

`.nojekyll` is included so Pages serves the files as they are. After the site is published, add `#your-topic` to the Pages URL.

Sound is off until you turn it on. Lighting follows the clock on the computer you are using.

## License

This project is MIT, copyright Loi Fai Lim. See [LICENSE](LICENSE).

three.js is MIT, copyright the three.js authors, and is loaded from jsDelivr rather than vendored: <https://github.com/mrdoob/three.js/blob/master/LICENSE>.

---

# AI 辦公室

這是一個給 GitHub Pages 用的靜態、即時 3D 辦公室。每個團隊一層樓。每個機器人是一個低面數的小角色，會依照私人 [ntfy.sh](https://ntfy.sh) 主題上的訊息打字、閒逛、等待、垂頭或跳一下。

頁面只有 HTML、CSS 和 JavaScript，不需要建置。唯一的函式庫是 [three.js](https://github.com/mrdoob/three.js)（MIT），從 jsDelivr 載入。只有在網址雜湊裡有主題時，頁面才會連線到 `https://ntfy.sh`；除此之外只會向該 CDN 取 three.js。

## 看即時辦公室

把主題放在網址的雜湊後面：

```text
https://<user>.github.io/<repo>/#your-topic-name
```

主題必須符合 `^[A-Za-z0-9_-]{6,64}$`。例如 `#gbw-XXXXXXXXXXXXXXXXXXXXXX`。

**這條連結就像密碼。** 拿到連結的人就能讀取這條串流。不要分享、不要提交進版本庫，也不要放進準備公開的截圖。頁面只會把主題送給 `ntfy.sh`。瀏覽器的 `localStorage` 會留下上一份狀態，好讓下一次打開時先看到辦公室。

沒有雜湊時，頁面只顯示示範辦公室，不會連到 ntfy。

## 訊息格式

每則訊息是一個 JSON 物件。頁面把所有欄位都當成不可信的文字。

完整名單。不在最新名單裡的機器人會消失：

```json
{"roster":["Kai","研究｜文獻研究員"]}
```

每個機器人的團隊。Ops 在一樓。每個不同的團隊有自己的樓層，最多六層，順序穩定：

```json
{"groups":{"Kai":"Ops","研究｜文獻研究員":"Research"}}
```

外觀。`shape` 可以是 `sphere`、`rounded_cube`、`pill`、`triangle`、`cone`、`pentagon`、`hexagon`、`star4`、`star6`、`clover`、`rounded_square`、`trio`。`accessory` 可以是 `none`、`glasses`、`stem`、`antenna`、`bow`。`color` 是 `#RRGGBB`。不認得的值會退回一個普通角色。

```json
{"looks":{"Kai":{"shape":"sphere","color":"#1E86FC","accessory":"antenna"}}}
```

即時狀態。`status` 為 `working`、`idle`、`waiting_user`、`error` 或 `done`。`step` 是短句，顯示在名單裡；滑過或點一下角色時也會出現在頭頂。

```json
{"bot":"Kai","status":"working","step":"checking the deploy"}
```

工作中的機器人坐在桌前打字，螢幕會亮。閒置時睡覺或走動。等待時舉手並顯示 `!`。錯誤時垂頭，頭頂是紅色 `×`。完成時跳一下、冒出火花，然後休息。若狀態停在 `working` 且 20 分鐘沒有新訊息，會淡成閒置。

可選的例行工作。沒收到之前，這個卡片會隱藏：

```json
{"routines":{"bot":"Kai","items":[{"name":"Morning digest","schedule":"0 9 * * 1-5","next_run":"2026-11-08T09:00:00Z"}]}}
```

可選的用量：

```json
{"type":"usage","total_used_pct":37,"resets_at":"2026-12-01T00:00:00Z","bots":{"Kai":4.1}}
```

名字可以包含中日韓文字和全形直線 `｜`。標籤是 HTML 文字，不是 WebGL 字型，所以這些字看得清楚。

載入時頁面會抓 `https://ntfy.sh/<topic>/json?poll=1&since=12h`，接著用 `https://ntfy.sh/<topic>/sse` 跟著更新；斷線重連時用 `since=<最後的 id>` 補上漏掉的訊息。

## 開啟 GitHub Pages

1. 把這個儲存庫推上要發佈的分支（`main`）。
2. 在儲存庫裡打開 **Settings → Pages**。
3. 在 **Build and deployment** 選擇 **Deploy from a branch**。
4. 分支選 **main**，資料夾選 **/ (root)**，然後儲存。

專案裡有 `.nojekyll`，Pages 會照原樣提供檔案。網站上線後，把 `#你的主題` 加到 Pages 網址後面。

音效預設關閉。光線依照你這台電腦的本地時間，在白天和夜晚之間變化。

## 授權

本專案為 MIT 授權，著作權人 Loi Fai Lim。見 [LICENSE](LICENSE)。

three.js 為 MIT 授權，著作權屬 three.js 作者，由 jsDelivr 載入，沒有一併放進這個儲存庫：<https://github.com/mrdoob/three.js/blob/master/LICENSE>。
