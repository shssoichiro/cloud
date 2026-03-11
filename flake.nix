{
  description = "Kilo Code Backend development environment";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-25.11";
  };

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-linux"
      ];

      forAllSystems = nixpkgs.lib.genAttrs systems;

      mkDevShell =
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
          };
        in
        pkgs.mkShell {
          name = "kilo-code-backend";

          packages = with pkgs; [
            git
            git-lfs
            nodejs_22
            corepack_22
            dotenvx
            _1password-cli
            postgresql_18
            wrangler
            nodePackages.vercel
            flyctl
            cloudflared
          ];

          env = {
            # Node.js TLS: extra CA certificates for the wrangler Node.js process.
            NODE_EXTRA_CA_CERTS = "/etc/ssl/certs/ca-certificates.crt";
          };

          shellHook = ''
            # workerd's BoringSSL calls SSL_CTX_set_default_verify_paths(), which reads
            # SSL_CERT_FILE and falls back to the compiled-in /etc/ssl/cert.pem.
            # NixOS doesn't create /etc/ssl/cert.pem, so force-export SSL_CERT_FILE here.
            # We use shellHook (not env) because nixpkgs stdenv also sets SSL_CERT_FILE
            # internally, which silently wins over the env attribute.
            export SSL_CERT_FILE="/etc/ssl/certs/ca-certificates.crt"
          '';
        };
    in
    {
      devShells = forAllSystems (system: {
        default = mkDevShell system;
      });
    };
}
