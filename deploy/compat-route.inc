    # BEGIN browser compatibility probe
    location = /compat {
        absolute_redirect off;
        return 308 /compat/;
    }

    location = /compat/ {
        try_files /dist/frontend/compat/index.html =404;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
        include /var/www/tsukuyomi-space/deploy/security-headers.inc;
    }

    location = /compat/index.html {
        try_files /dist/frontend/compat/index.html =404;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
        include /var/www/tsukuyomi-space/deploy/security-headers.inc;
    }
    # END browser compatibility probe

