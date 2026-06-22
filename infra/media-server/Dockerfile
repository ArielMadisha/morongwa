FROM alpine:3.19

RUN apk add --no-cache nginx nginx-mod-rtmp \
    && install -d -o nginx -g nginx /opt/hls /run/nginx \
    && ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log

COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN nginx -t

EXPOSE 1935 8081

ENTRYPOINT ["/entrypoint.sh"]
