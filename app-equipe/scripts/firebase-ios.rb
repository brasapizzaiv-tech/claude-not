# Liga o Firebase no projeto do iPhone (roda no CI, num Mac, depois do
# patch-ios.mjs): põe o GoogleService-Info.plist nos recursos do app (o plugin
# de avisos chama FirebaseApp.configure(), que procura esse arquivo) e aponta o
# arquivo de permissões (App.entitlements, com o aps-environment do push).
# Usa a gem xcodeproj, que vem junto com o CocoaPods. Pode rodar de novo.
require "xcodeproj"

projeto = Xcodeproj::Project.open(File.join(__dir__, "..", "ios", "App", "App.xcodeproj"))
alvo = projeto.targets.find { |t| t.name == "App" } or abort("alvo App não encontrado")
grupo = projeto.main_group["App"] or abort("grupo App não encontrado")

plist = File.join(__dir__, "..", "ios", "App", "App", "GoogleService-Info.plist")
if File.exist?(plist)
  unless grupo.files.any? { |f| f.path == "GoogleService-Info.plist" }
    ref = grupo.new_reference("GoogleService-Info.plist")
    alvo.resources_build_phase.add_file_reference(ref)
  end
  puts "ok GoogleService-Info.plist nos recursos"
else
  puts "sem GoogleService-Info.plist: o app compila, mas sem avisos"
end

alvo.build_configurations.each { |c| c.build_settings["CODE_SIGN_ENTITLEMENTS"] = "App/App.entitlements" }
puts "ok App.entitlements"
projeto.save

# Gesto de voltar do iPhone (deslizar da borda esquerda): a tela principal é a
# MainViewController.swift, que precisa estar entre os arquivos compilados.
arquivo = "MainViewController.swift"
if File.exist?(File.join(__dir__, "..", "ios", "App", "App", arquivo)) &&
   grupo.files.none? { |f| f.path == arquivo }
  ref = grupo.new_reference(arquivo)
  alvo.source_build_phase.add_file_reference(ref)
  projeto.save
  puts "ok #{arquivo} no projeto"
end
