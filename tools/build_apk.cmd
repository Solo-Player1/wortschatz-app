@echo off
setlocal EnableExtensions
rem ==========================================================================
rem  Wortschatz - build the signed release APK (Windows cmd, no Git Bash needed)
rem  Same steps as tools\build_apk.sh.  Output: dist\Wortschatz-v<version>.apk
rem  Needs the portable toolchain from C:\Users\abdel\AndroidDev\install.sh
rem  (JDK 21 + Android SDK). First run downloads Gradle + dependencies: minutes.
rem ==========================================================================
set "ROOT=%~dp0.."
pushd "%ROOT%" || exit /b 1

set "JAVA_HOME=C:\Users\abdel\AndroidDev\jdk21"
set "ANDROID_HOME=C:\Users\abdel\AndroidDev\sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\cmdline-tools\latest\bin;%PATH%"

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo ERROR: JDK 21 not found at %JAVA_HOME%
  echo        run C:\Users\abdel\AndroidDev\install.sh in Git Bash and wait until it prints DONE
  goto :fail
)
if not exist "%ANDROID_HOME%\platforms" (
  echo ERROR: Android SDK not found at %ANDROID_HOME%
  echo        run C:\Users\abdel\AndroidDev\install.sh in Git Bash and wait until it prints DONE
  goto :fail
)

set "VER="
for /f "usebackq delims=" %%V in (`node -p "require('./package.json').version"`) do set "VER=%%V"
if not defined VER set "VER=0.0.0"
echo == Wortschatz v%VER% ==

rem 1) android\local.properties (escaped Windows path, the format Gradle expects)
> "android\local.properties" echo sdk.dir=C\:\\Users\\abdel\\AndroidDev\\sdk

rem 2) release keystore (no-op if it already exists)
call :make_keystore
if errorlevel 1 goto :fail

rem 3) copy www\ into the native project + update plugins
echo == npx cap sync android
call npx cap sync android
if errorlevel 1 (
  echo ERROR: cap sync failed
  goto :fail
)

rem 4) gradle
echo == gradle assembleRelease ^(first run downloads Gradle + dependencies, be patient^)
pushd android
call gradlew.bat assembleRelease --no-daemon --console=plain
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" (
  echo ERROR: gradle build failed
  goto :fail
)

rem 5) collect the APK
set "APK=android\app\build\outputs\apk\release\app-release.apk"
if not exist "%APK%" (
  set "APK=android\app\build\outputs\apk\release\app-release-unsigned.apk"
  echo WARNING: APK is UNSIGNED ^(keystore missing^) - it will not install on a phone
)
if not exist "%APK%" (
  echo ERROR: no APK produced
  goto :fail
)
if not exist "dist" mkdir "dist"
copy /y "%APK%" "dist\Wortschatz-v%VER%.apk" >nul
if errorlevel 1 (
  echo ERROR: could not copy the APK into dist\
  goto :fail
)
for %%F in ("dist\Wortschatz-v%VER%.apk") do echo == APK ready: %%~fF ^(%%~zF bytes^)
popd
exit /b 0

:fail
popd
exit /b 1

rem --------------------------------------------------------------------------
:make_keystore
if exist "android\keystore\wortschatz.jks" exit /b 0
if not exist "android\keystore.properties" (
  echo ERROR: android\keystore.properties is missing - run: bash tools/make_keystore.sh
  exit /b 1
)
set "PW="
set "ALIAS=wortschatz"
for /f "usebackq tokens=1,* delims==" %%A in ("android\keystore.properties") do (
  if /i "%%A"=="storePassword" set "PW=%%B"
  if /i "%%A"=="keyAlias" set "ALIAS=%%B"
)
if not defined PW (
  echo ERROR: storePassword not found in android\keystore.properties
  exit /b 1
)
if not exist "android\keystore" mkdir "android\keystore"
echo == creating keystore android\keystore\wortschatz.jks ^(alias %ALIAS%^)
"%JAVA_HOME%\bin\keytool.exe" -genkeypair -v -keystore "android\keystore\wortschatz.jks" -storetype PKCS12 -alias "%ALIAS%" -keyalg RSA -keysize 2048 -validity 10000 -storepass "%PW%" -keypass "%PW%" -dname "CN=Wortschatz, OU=Mobile, O=Abdullah, L=Cairo, ST=Cairo, C=EG"
if errorlevel 1 (
  echo ERROR: keytool failed
  exit /b 1
)
echo == keystore created. Password is in android\keystore\PASSWORD.txt - back up that folder!
exit /b 0
