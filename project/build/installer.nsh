!macro customInstall
  ; Remove only the five retired curriculum documents from older installations.
  Delete "$INSTDIR\resources\school-program\frp-music-5-8-2025.pdf"
  Delete "$INSTDIR\resources\school-program\frp-music-5-8-2025.txt"
  Delete "$INSTDIR\resources\school-program\frp-pe-5-9-2025.pdf"
  Delete "$INSTDIR\resources\school-program\frp-pe-5-9-2025.txt"
  Delete "$INSTDIR\resources\school-program\frp-pe-10-11-2025.pdf"
  Delete "$INSTDIR\resources\school-program\frp-pe-10-11-2025.txt"
  Delete "$INSTDIR\resources\school-program\frp-obzr-8-9-2025.pdf"
  Delete "$INSTDIR\resources\school-program\frp-obzr-8-9-2025.txt"
  Delete "$INSTDIR\resources\school-program\frp-obzr-10-11-2025.pdf"
  Delete "$INSTDIR\resources\school-program\frp-obzr-10-11-2025.txt"
  IfFileExists "$EXEDIR\Cosmos-Models\Qwen3-8B-Q4_K_M.gguf" 0 cosmosVisionLanguage
    CreateDirectory "$INSTDIR\resources\runtime\models"
    ClearErrors
    CopyFiles /SILENT "$EXEDIR\Cosmos-Models\Qwen3-8B-Q4_K_M.gguf" "$INSTDIR\resources\runtime\models"
    IfErrors cosmosModelCopyFailed
  cosmosVisionLanguage:
  IfFileExists "$EXEDIR\Cosmos-Models\vision\Qwen3VL-4B-Instruct-Q4_K_M.gguf" 0 cosmosVisionProjector
    CreateDirectory "$INSTDIR\resources\runtime\models\vision"
    ClearErrors
    CopyFiles /SILENT "$EXEDIR\Cosmos-Models\vision\Qwen3VL-4B-Instruct-Q4_K_M.gguf" "$INSTDIR\resources\runtime\models\vision"
    IfErrors cosmosModelCopyFailed
  cosmosVisionProjector:
  IfFileExists "$EXEDIR\Cosmos-Models\vision\mmproj-Qwen3VL-4B-Instruct-F16.gguf" 0 cosmosModelsDone
    CreateDirectory "$INSTDIR\resources\runtime\models\vision"
    ClearErrors
    CopyFiles /SILENT "$EXEDIR\Cosmos-Models\vision\mmproj-Qwen3VL-4B-Instruct-F16.gguf" "$INSTDIR\resources\runtime\models\vision"
    IfErrors cosmosModelCopyFailed cosmosModelsDone
  cosmosModelCopyFailed:
    MessageBox MB_OK|MB_ICONSTOP "Не удалось скопировать локальную модель. Проверь свободное место и повтори установку, оставив папку Cosmos-Models рядом с установщиком." /SD IDOK
    SetErrorLevel 1
    Abort
  cosmosModelsDone:
!macroend
