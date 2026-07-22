#!/usr/bin/env python3
"""Install the offline Chinese/Japanese to English Argos model packages."""

import argostranslate.package
import argostranslate.translate


def main() -> None:
    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()
    installed_pairs = {
        (source.code, target.code)
        for source in argostranslate.translate.get_installed_languages()
        for target in source.translations_to
    }
    for source_code in ("zh", "ja"):
        if (source_code, "en") in installed_pairs:
            print(f"READY {source_code}->en", flush=True)
            continue
        candidates = [
            package for package in available
            if package.from_code == source_code and package.to_code == "en"
        ]
        if not candidates:
            raise RuntimeError(f"No Argos package is available for {source_code}->en")
        package = sorted(candidates, key=lambda item: item.package_version, reverse=True)[0]
        print(f"INSTALLING {source_code}->en {package.package_version}", flush=True)
        argostranslate.package.install_from_path(package.download())
        print(f"INSTALLED {source_code}->en", flush=True)

    for source_code, sample in (
        ("zh", "欢迎来到月读空间"),
        ("ja", "いつもご支援ありがとうございます"),
    ):
        translated = argostranslate.translate.translate(sample, source_code, "en")
        print(f"TEST {source_code}: {translated}", flush=True)


if __name__ == "__main__":
    main()
