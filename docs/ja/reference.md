# リファレンス

## 設定

Docker Composeでは `.env`、`docker run` では `-e` で設定します。

| 変数 | 用途 | 初期値 |
| --- | --- | --- |
| `RECORDINGS_DIR` | 録画フォルダ。アップロード先も同じ | `./recordings` |
| `TZ` | 作成時刻のない動画のファイル名に使うタイムゾーン | `UTC` |
| `BIND_IP` / `PORT` | 待ち受けアドレスとポート | `127.0.0.1` / `8080` |
| `CACHE_DIR` | 抽出した音声・サムネイル・試合終了の目印 | `./cache` |

任意で `config/config.json`（[設定例](https://github.com/hrs23/apex-hanseikai/blob/main/config.example.json)）にタイトルを設定できます。

## 指針

ホームには、チーム用1つと個人用3つの、編集できるカードがあります。鉛筆ボタンからMarkdownで書きます（各500文字まで、1行1ブロック）。

- `# タイトル` は大見出し、`## セクション` は小見出しです。個人用のカードは `# ロール | レジェンド` のようにするのが定番です。
- `- 項目` は箇条書きで、それ以外の行は段落です。
- `**太字**`、`==ハイライト==`、`[ラベル](url)` はどの行でも使え、入れ子にもできます。
- リンクは `https://…` か、録画の特定の場面を開くシーンリンク `#watch?rec=<ファイル名>&t=<秒>` が使えます。

APIの `/docs` でも同じ文章を読み書きできます。

## 試合終了の目印

試合終了の検知は、Apex Legendsの日本語UI・ゲームパッド表示に合わせています。別のUIや表示では検知できない場合があります。

## 開けない場合

Docker Desktopが起動しているか確認します。アプリのフォルダで `docker compose logs --tail 50` を実行してログを確認します。

## 開発とAPI

[Development & API](https://github.com/hrs23/apex-hanseikai/blob/main/docs/development.md)
