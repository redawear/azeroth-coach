#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
[Setup]
AppId={{7C037864-5D53-4C97-9B41-95A69D1D730D}
AppName=Azeroth Coach
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\AzerothCoach
DefaultGroupName=Azeroth Coach
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableWelcomePage=no
DisableFinishedPage=no
UninstallDisplayName=Azeroth Coach
UninstallDisplayIcon={app}\AzerothCoach.exe
OutputDir=..\dist
OutputBaseFilename=AzerothCoach-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
SetupLogging=yes

[Messages]
WelcomeLabel1=Azeroth Coach
WelcomeLabel2=Azeroth Coach adds a leveling coach and an AI chat to World of Warcraft: Forever.%n%nClose World of Warcraft before you continue.
FinishedHeadingLabel=Azeroth Coach

[Files]
Source: "..\build\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\build\app\AzerothCoach.exe"; DestDir: "{tmp}"; Flags: dontcopy
Source: "..\companion\*"; DestDir: "{tmp}\companion"; Flags: dontcopy recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Restart Azeroth Coach"; Filename: "{app}\AzerothCoach.exe"; Parameters: """{app}\companion\main.js"" --restart"; WorkingDir: "{app}"
Name: "{group}\Edit settings"; Filename: "{sys}\notepad.exe"; Parameters: """{localappdata}\AzerothCoach\config.json"""
Name: "{group}\Open log folder"; Filename: "{localappdata}\AzerothCoach"
Name: "{group}\Uninstall Azeroth Coach"; Filename: "{uninstallexe}"

[Registry]
Root: HKCU; Subkey: "Software\AzerothCoach"; ValueType: string; ValueName: "Client"; ValueData: "{code:ClientPath}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\AzerothCoach"; ValueType: string; ValueName: "App"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "AzerothCoach"; Flags: uninsdeletevalue

[Code]
var
  GamePage: TInputDirWizardPage;
  AIPage: TWizardPage;
  ClaudeRadio, CodexRadio, NoneRadio: TNewRadioButton;
  StartupCheck: TNewCheckBox;
  Detection, InstallResult, QuestResult: String;
  DeleteHistory: Boolean;

function Q(Value: String): String;
begin
  Result := '"' + Value + '"';
end;

function JsonValue(Json, Key: String): String;
var
  I, N, Start: Integer;
  C: Char;
begin
  Result := '';
  I := Pos('"' + Key + '":', Json);
  if I = 0 then exit;
  I := I + Length(Key) + 3;
  while (I <= Length(Json)) and (Json[I] = ' ') do I := I + 1;
  if I > Length(Json) then exit;
  if Json[I] <> '"' then begin
    Start := I;
    while (I <= Length(Json)) and (Json[I] <> ',') and (Json[I] <> '}') do I := I + 1;
    Result := Copy(Json, Start, I - Start);
    exit;
  end;
  I := I + 1;
  while I <= Length(Json) do begin
    C := Json[I];
    if C = '"' then exit;
    if C = '\' then begin
      I := I + 1;
      if I > Length(Json) then exit;
      C := Json[I];
      if C = 'u' then begin
        N := StrToIntDef('$' + Copy(Json, I + 1, 4), 0);
        Result := Result + Chr(N);
        I := I + 5;
        continue;
      end;
      if C = 'n' then C := #10;
      if C = 'r' then C := #13;
      if C = 't' then C := #9;
    end;
    Result := Result + C;
    I := I + 1;
  end;
end;

function Helper(Base, Args: String): String;
var
  Code: Integer;
  FileName: String;
  Data: AnsiString;
begin
  Result := '';
  FileName := ExpandConstant('{tmp}\azeroth-result.json');
  DeleteFile(FileName);
  if not Exec(Base + '\AzerothCoach.exe', Q(Base + '\companion\install.js') + ' ' + Args + ' --result ' + Q(FileName), Base, SW_HIDE, ewWaitUntilTerminated, Code) then exit;
  if LoadStringFromFile(FileName, Data) then Result := UTF8Decode(Data);
end;

function ClientPath(Param: String): String;
begin
  Result := GamePage.Values[0];
end;

function Provider: String;
begin
  if ClaudeRadio.Checked then Result := 'claude'
  else if CodexRadio.Checked then Result := 'codex'
  else Result := 'none';
end;

function ValidateGame: Boolean;
var
  Check, State: String;
  Answer: Integer;
begin
  Result := False;
  repeat
    Check := Helper(ExpandConstant('{tmp}'), '--validate --client ' + Q(GamePage.Values[0]));
    State := JsonValue(Check, 'status');
    if State = 'ready' then begin Result := True; exit; end;
    if State = 'game_running' then begin
      if WizardSilent then exit;
      Answer := MsgBox('World of Warcraft is open. Close it, then click Retry.', mbError, MB_RETRYCANCEL);
      if Answer <> IDRETRY then exit;
    end else begin
      if State = 'no_write' then MsgBox('Windows does not let this installer write to the game folder. Close the installer, then right-click it and select Run as administrator.', mbError, MB_OK)
      else if State = 'failed' then MsgBox(JsonValue(Check, 'message'), mbError, MB_OK)
      else MsgBox('Choose the `_forever_` folder. It holds Wow.exe.', mbError, MB_OK);
      exit;
    end;
  until False;
end;

procedure AddDetection(Top: Integer; Found: Boolean);
var
  LabelText: TNewStaticText;
begin
  LabelText := TNewStaticText.Create(AIPage);
  LabelText.Parent := AIPage.Surface;
  LabelText.Left := ScaleX(24);
  LabelText.Top := ScaleY(Top);
  LabelText.Width := AIPage.SurfaceWidth - ScaleX(24);
  LabelText.Height := ScaleY(32);
  LabelText.AutoSize := False;
  LabelText.WordWrap := True;
  if Found then LabelText.Caption := 'Found'
  else LabelText.Caption := 'Not found. Install it first, or choose another option.';
end;

procedure InitializeWizard;
var
  FoundClaude, FoundCodex: Boolean;
  Choice, Client: String;
  Note: TNewStaticText;
begin
  ExtractTemporaryFile('AzerothCoach.exe');
  ExtractTemporaryFiles('{tmp}\companion\*');
  Detection := Helper(ExpandConstant('{tmp}'), '--detect');
  GamePage := CreateInputDirPage(wpWelcome, 'Where is World of Warcraft: Forever?', 'We found this folder. Change it if it is wrong.', '', False, '');
  GamePage.Add('');
  GamePage.Buttons[0].Caption := 'Browse…';
  Client := ExpandConstant('{param:CLIENT|}');
  if Client = '' then RegQueryStringValue(HKCU, 'Software\AzerothCoach', 'Client', Client);
  if Client = '' then Client := JsonValue(Detection, 'client');
  GamePage.Values[0] := Client;
  AIPage := CreateCustomPage(GamePage.ID, 'Which AI do you use?', '');
  ClaudeRadio := TNewRadioButton.Create(AIPage);
  ClaudeRadio.Parent := AIPage.Surface;
  ClaudeRadio.SetBounds(0, 0, AIPage.SurfaceWidth, ScaleY(24));
  ClaudeRadio.Caption := 'Claude — uses your Claude Code sign-in';
  CodexRadio := TNewRadioButton.Create(AIPage);
  CodexRadio.Parent := AIPage.Surface;
  CodexRadio.SetBounds(0, ScaleY(64), AIPage.SurfaceWidth, ScaleY(24));
  CodexRadio.Caption := 'Codex — uses your Codex sign-in';
  NoneRadio := TNewRadioButton.Create(AIPage);
  NoneRadio.Parent := AIPage.Surface;
  NoneRadio.SetBounds(0, ScaleY(128), AIPage.SurfaceWidth, ScaleY(24));
  NoneRadio.Caption := 'No AI — coach tips only, from the quest data';
  FoundClaude := JsonValue(Detection, 'claude') = 'true';
  FoundCodex := JsonValue(Detection, 'codex') = 'true';
  AddDetection(26, FoundClaude);
  AddDetection(90, FoundCodex);
  Note := TNewStaticText.Create(AIPage);
  Note.Parent := AIPage.Surface;
  Note.SetBounds(0, ScaleY(176), AIPage.SurfaceWidth, ScaleY(48));
  Note.AutoSize := False;
  Note.WordWrap := True;
  Note.Caption := 'The AI runs with your own plan. Azeroth Coach does not see your password.';
  Choice := ExpandConstant('{param:PROVIDER|}');
  if Choice = '' then begin
    if FoundClaude then Choice := 'claude'
    else if FoundCodex then Choice := 'codex'
    else Choice := 'none';
  end;
  if (Choice <> 'claude') and (Choice <> 'codex') and (Choice <> 'none') then RaiseException('Use claude, codex, or none.');
  ClaudeRadio.Checked := Choice = 'claude';
  CodexRadio.Checked := Choice = 'codex';
  NoneRadio.Checked := Choice = 'none';
  StartupCheck := TNewCheckBox.Create(WizardForm);
  StartupCheck.Parent := WizardForm.FinishedPage;
  StartupCheck.SetBounds(WizardForm.FinishedLabel.Left, ScaleY(200), WizardForm.FinishedLabel.Width, ScaleY(48));
  StartupCheck.Caption := 'Start Azeroth Coach when Windows starts';
  StartupCheck.Checked := True;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := PageID = wpPreparing;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = GamePage.ID) or (CurPageID = AIPage.ID) then Result := ValidateGame;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Base: String;
  Code: Integer;
begin
  Result := '';
  if not ValidateGame then begin Result := 'Close World of Warcraft before you continue.'; exit; end;
  Base := ExpandConstant('{app}');
  if FileExists(Base + '\AzerothCoach.exe') then begin
    if not Exec(Base + '\AzerothCoach.exe', Q(Base + '\companion\main.js') + ' --stop', Base, SW_HIDE, ewWaitUntilTerminated, Code) then begin Result := 'The companion did not stop.'; exit; end;
    if Code <> 0 then Result := 'The companion did not stop.';
  end;
end;

procedure SetStartup;
var
  RunKey: String;
begin
  RunKey := 'Software\Microsoft\Windows\CurrentVersion\Run';
  if (Provider <> 'none') and StartupCheck.Checked then
    RegWriteStringValue(HKCU, RunKey, 'AzerothCoach', Q(ExpandConstant('{app}\AzerothCoach.exe')) + ' ' + Q(ExpandConstant('{app}\companion\main.js')))
  else RegDeleteValue(HKCU, RunKey, 'AzerothCoach');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Base, Args: String;
  Code: Integer;
begin
  if CurStep = ssInstall then WizardForm.StatusLabel.Caption := 'Install Azeroth Coach…';
  if CurStep = ssPostInstall then begin
    Base := ExpandConstant('{app}');
    WizardForm.StatusLabel.Caption := 'Download the quest data (QuestieDB)…';
    WizardForm.ProgressGauge.Max := 100;
    WizardForm.ProgressGauge.Position := 25;
    if ExpandConstant('{param:SKIPQUESTIEDB|0}') = '1' then QuestResult := '{"status":"questiedb_failed"}'
    else QuestResult := Helper(Base, '--questie --client ' + Q(GamePage.Values[0]));
    WizardForm.StatusLabel.Caption := 'Install the addons…';
    WizardForm.ProgressGauge.Position := 50;
    Args := '--client ' + Q(GamePage.Values[0]) + ' --provider ' + Provider;
    InstallResult := Helper(Base, Args);
    if JsonValue(InstallResult, 'status') <> 'ready' then RaiseException('The addons did not install. ' + JsonValue(InstallResult, 'message'));
    if Provider <> 'none' then begin
      WizardForm.StatusLabel.Caption := 'Start Azeroth Coach…';
      WizardForm.ProgressGauge.Position := 75;
      if not Exec(Base + '\AzerothCoach.exe', Q(Base + '\companion\main.js'), Base, SW_HIDE, ewNoWait, Code) then RaiseException('The companion did not start.');
    end;
    WizardForm.ProgressGauge.Position := 100;
    SetStartup;
  end;
  if CurStep = ssDone then SetStartup;
end;

procedure CurPageChanged(CurPageID: Integer);
var
  Check, State, MessageText, Name, Command: String;
begin
  if CurPageID = wpFinished then begin
    StartupCheck.Visible := Provider <> 'none';
    Check := Helper(ExpandConstant('{app}'), '--check');
    State := JsonValue(Check, 'status');
    if (JsonValue(QuestResult, 'status') <> 'ready') or (State = 'questiedb_failed') then
      MessageText := 'Azeroth Coach is installed, but the quest data did not download. Check the internet connection, then run this installer again.'
    else if State <> 'ready' then begin
      if Provider = 'claude' then begin Name := 'Claude'; Command := 'claude'; end
      else begin Name := 'Codex'; Command := 'codex'; end;
      MessageText := 'Azeroth Coach is installed, but ' + Name + ' did not answer. Open a terminal, type `' + Command + '`, and sign in. The coach works now with simple tips.';
    end else MessageText := 'Ready. Start World of Warcraft: Forever, then type /coach.';
    if JsonValue(InstallResult, 'upgrade') = 'true' then MessageText := MessageText + #13#10#13#10 + 'Restart World of Warcraft to load the new version.';
    WizardForm.FinishedLabel.Caption := MessageText;
  end;
end;

function InitializeUninstall: Boolean;
var
  Form: TSetupForm;
  Check: TNewCheckBox;
  AcceptButton, CancelButton: TNewButton;
begin
  Result := True;
  if UninstallSilent then exit;
#if VER >= 0x06060000
  Form := CreateCustomForm(400, 120, False, False);
#else
  Form := CreateCustomForm;
  Form.ClientWidth := ScaleX(400);
  Form.ClientHeight := ScaleY(120);
#endif
  try
    Form.Caption := 'Uninstall Azeroth Coach';
    Check := TNewCheckBox.Create(Form);
    Check.Parent := Form;
    Check.SetBounds(ScaleX(16), ScaleY(16), ScaleX(368), ScaleY(40));
    Check.Caption := 'Also delete my settings and chat history';
    Check.Checked := False;
    AcceptButton := TNewButton.Create(Form);
    AcceptButton.Parent := Form;
    AcceptButton.SetBounds(ScaleX(208), ScaleY(76), ScaleX(80), ScaleY(24));
    AcceptButton.Caption := 'Uninstall';
    AcceptButton.ModalResult := mrOk;
    CancelButton := TNewButton.Create(Form);
    CancelButton.Parent := Form;
    CancelButton.SetBounds(ScaleX(300), ScaleY(76), ScaleX(80), ScaleY(24));
    CancelButton.Caption := 'Cancel';
    CancelButton.ModalResult := mrCancel;
    Result := Form.ShowModal = mrOk;
    DeleteHistory := Check.Checked;
  finally Form.Free; end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Base, Client: String;
  Code: Integer;
begin
  if CurUninstallStep = usUninstall then begin
    Base := ExpandConstant('{app}');
    if not Exec(Base + '\AzerothCoach.exe', Q(Base + '\companion\main.js') + ' --stop', Base, SW_HIDE, ewWaitUntilTerminated, Code) then RaiseException('The companion did not stop.');
    if Code <> 0 then RaiseException('The companion did not stop.');
    if RegQueryStringValue(HKCU, 'Software\AzerothCoach', 'Client', Client) then begin
      if not Exec(Base + '\AzerothCoach.exe', Q(Base + '\companion\install.js') + ' --uninstall --addons ' + Q(Client + '\Interface\AddOns'), Base, SW_HIDE, ewWaitUntilTerminated, Code) then RaiseException('The addons did not uninstall.');
      if Code <> 0 then RaiseException('The addons did not uninstall.');
    end;
  end;
  if (CurUninstallStep = usPostUninstall) and DeleteHistory then DelTree(ExpandConstant('{localappdata}\AzerothCoach'), True, True, True);
end;
