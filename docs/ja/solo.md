# 1人で使う

## まず試す

1. [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)を入れて起動します。
2. ターミナルで次を実行します。

   ```bash
   docker run --rm -p 127.0.0.1:8080:8080 ghcr.io/hrs23/apex-hanseikai
   ```

3. `http://localhost:8080`を開き、MP4をアップロードします。録画ソフトは何でも構いません。

Ctrl+Cで止めると、データもすべて消えます。

## 録画とコメントを残す

`D:/Recordings`を録画フォルダ、`TZ`をお住まいの地域に変えて実行します。

```powershell
docker run -d --name apex-hanseikai --restart unless-stopped -p 127.0.0.1:8080:8080 -v apex-data:/data -v D:/Recordings:/recordings -e TZ=Asia/Tokyo ghcr.io/hrs23/apex-hanseikai
```

フォルダ内のファイルは、名前が `YYYY-MM-DD hh-mm-ss.mp4`（OBSの初期設定）ならアプリに表示されます。ほかのMP4をアップロードすると、名前を聞かれます。

更新するときは、`docker rm -f apex-hanseikai`、`docker pull ghcr.io/hrs23/apex-hanseikai`、上のコマンドの順に実行します。

## OBSで録画する

[OBS](https://obsproject.com/)を入れます。ゲーム画面と音声を追加し、Hybrid MP4・音声1トラック・初期のファイル名で録画します。2×2の配置は不要です。

## 次へ

友達と遊ぶなら[3人で使う（応用）](squad.md)。
