
cd "C:\Vtt\Dev\MetromobiliteWS"

@IF EXIST "%~dp0\node.exe" (
  "%~dp0\node.exe" --harmony "index.js" %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node --harmony "index.js" %*
)