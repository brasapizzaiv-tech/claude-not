import UIKit
import Capacitor

// Tela principal do app (a que mostra o site). Existe só pra ligar o gesto do
// iPhone de deslizar da borda esquerda pra VOLTAR — o mesmo do Safari. O
// WKWebView nasce com ele desligado e o Capacitor não tem opção pra isso.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        webView?.allowsBackForwardNavigationGestures = true
    }
}
