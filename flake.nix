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
          ];
        };
    in
    {
      devShells = forAllSystems (system: {
        default = mkDevShell system;
      });
    };
}
