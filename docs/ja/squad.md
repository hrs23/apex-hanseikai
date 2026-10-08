# 3人で使う（応用）

プレイヤー1人のゲーミングPC（ホスト）が全員分を録画し、アプリも動かします。仲間はOBSから画面と声を送り、ブラウザで見ます。

[![3人のPCで使うOBS、Tailscale、Webアプリとブラウザの関係](/diagrams/recommended-ja.svg)](/diagrams/recommended-ja.svg)

ホストはWindows・OBS・Docker Desktop・Gitを用意します。仲間は[Tailscale](https://tailscale.com/download)とブラウザ、自分の画面と声を送るならOBSも用意します。

## 1. ホストPCを共有する {#share}

[管理画面](https://login.tailscale.com/admin/machines)でホストのメニューから **Share** を選び、仲間ごとに招待リンクを渡します。仲間は共有を受け取り、Tailscaleを接続したままにします。詳しくは[Tailscaleの共有ガイド](https://tailscale.com/kb/1084/sharing)へ。

共有するのはホストの1台だけです。すでに共有しているなら、そのまま使えます。

## 2. 録画を作る {#record}

ホストのOBSが、全員を1本のMP4に録画します。

- 映像は2×2。ホストを左上に置き、右上・左下・右下の順に仲間を配置。空き枠は自由に使えます。
- 音声トラック1は全体のMix、2以降は映像と同じ順で各プレイヤーの声。トラック名が、アプリに表示されるプレイヤー名になります。

### ホストのOBS

[3人用のOBSシーン（Windows）](../obs/scene.json)をダウンロードするか、[手動で作ります](#manual)。

1. OBSで今のシーンコレクションをエクスポートして保存。
2. 「シーンコレクション → インポート」でダウンロードしたJSONを選択。
3. `Player 1 game` と `Game audio` を自分のゲーム、`Player 1 mic` を自分のマイクに設定。
4. 設定 → 出力 → 詳細 → 録画でHybrid MP4を選び、音声トラック1〜4を有効に。音声タブでトラック1を `Mix`、2〜4をプレイヤー名にします。

シーンは `Apex`、キャンバスは2560×1440です。

### 仲間のOBS

設定 → 配信 → カスタムで、サーバーを `srt://<ホストのTailscale IP>:10002` にします。2人目は `10003` です。ホストが録画を始める前に、配信を開始します。

### テスト録画

1人ずつ話す短い動画を録画して、アプリで確認します。

- 声：個人の視点で、その人の声だけが聞こえるか確認。ミキサーで音量を揃えます。
- ずれ：仲間の映像はホストより遅れて届きます。同じゲーム内カウントダウンで映像のずれを確認し、早い映像にレンダリング遅延フィルタ（1つにつき最大500ms）、音声にも詳細オーディオプロパティで同じ同期オフセットを設定します。

### Codex・Claude Codeでシーンを調整する {#ai}

ホストPC上で、CodexやClaude Codeにこのリポジトリを開かせます。例えば：

```text
docs/public/obs/scene.jsonを、自分の環境に合わせて調整してください。
docs/ja/squad.mdの録画仕様に従ってください。
WindowsでApex Legendsを3人で遊び、Player 1のPCで録画します。
自分のゲームとマイクはこのPC、仲間2人はOBSからSRTで送信します。
マイク：［使いたいデバイス名］
画面配置と音声トラックの分離を保ち、元の設定例は変更せず、
インポート用のobs-custom.jsonを新しく作ってください。
変更点と、OBSで別途設定する項目も教えてください。
```

### シーンを手動で作る {#manual}

1. 設定 → 映像：16:9のキャンバス（例：2560×1440）。
2. ゲームキャプチャを追加。変換の編集で位置を0, 0、バウンディングボックスを「境界内に収める」、サイズをキャンバスの半分（1280×720）に。
3. マイクの音声入力キャプチャと、ゲーム音のアプリケーション音声キャプチャを追加。
4. 仲間ごとにメディアソースを追加。「ローカルファイル」を外し、入力を `srt://0.0.0.0:10002?mode=listener` に。次の仲間は10003など別ポートを使います。サイズは同じ1280×720で、2人目を1280, 0、3人目を0, 720に配置。
5. 音が重複しないよう、グローバルのデスクトップ音声とMic/Auxをミュート。
6. 音声の詳細プロパティで、ゲーム音をトラック1、自分のマイクを1と2、2人目を1と3、3人目を1と4に割り当て。

そのあと、上の手順4の録画設定を行います。

## 3. アプリを起動する {#app}

ホストで、Docker Desktopを起動してから、PowerShellで次を実行します。

```powershell
git clone https://github.com/hrs23/apex-hanseikai.git
cd apex-hanseikai
Copy-Item .env.example .env
notepad .env
```

`.env`に録画フォルダ（OBSの録画先）と時刻の地域を設定します。

```dotenv
RECORDINGS_DIR=D:/Recordings
TZ=Asia/Tokyo
```

保存してメモ帳を閉じ、実行します。

```powershell
docker compose up -d
```

`http://localhost:8080`を開きます。録画の処理が終わると、再生できるようになります。

先に「1人で」のコマンドで起動していた場合は、`docker rm -f apex-hanseikai`を先に実行します。更新するときは `docker compose pull` と `docker compose up -d` を実行します。

## 4. みんなで見返す {#watch}

ホストで、アプリのTailscale URLを用意します。

```powershell
tailscale serve --bg http://127.0.0.1:8080
tailscale serve status
```

初回に設定ページが案内されたら、表示されたリンクからHTTPSを有効にします。`status`に表示される `https://録画PC名.…ts.net` を仲間に渡します。すでにServeを使っている場合は、先に[公式ガイド](https://tailscale.com/docs/reference/tailscale-cli/serve)を確認してください。

このアプリにはログインがありません。アクセスできる人は視聴・追加・コメント編集ができます。信頼する仲間にだけ、Tailscale経由で共有します。

全員がTailscaleを接続した状態で同じURLを開き、**Watch Party** をオンにします。ホストのPC・Docker・Tailscaleは起動したままにします。

- 誰かが再生・停止・移動・視点切り替えをすると、全員の画面がそろう。
- **0** で全体、**1〜4** で個人の画面と声に切り替え。
- **C** でその場面にコメント。次から取る行動を残す。
- 止めた映像をドラッグして描画。**X** で消す。
- **A / D** で前後の試合終了の60秒前へ移動。

![コメントと描画のサンプル画面](/screenshots/watch-party.jpg)

接続できない場合は、両方のTailscaleが接続中か、共有を受け取ったかを確認します。
