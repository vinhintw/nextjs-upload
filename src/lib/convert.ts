export interface ConvertHlsStreamProps {
  source: string;
  bucketName: string;
  folderName: string;
}
export const convertHlsStream = async ({
  source,
  bucketName = "assets",
  folderName,
}: ConvertHlsStreamProps) => {
  const convertScript = `
name: Convert ${source} to HLS
description: |
  Generates a multi-bitrate HLS from ${source} and uploads it to Minio

inputs:
  source: ${source}
  bucketName: ${bucketName}
  folderName: ${folderName}
  accessKeyID: ${process.env.S3_ACCESS_KEY}
  secretKeyID: ${process.env.S3_SECRET_KEY}
  endpointURL: ${process.env.MINIO_ENDPOINT}

tasks:
  - name: analyze video input
    var: resolution
    image: forumi0721/alpine-ffmpeg:latest
    run: |
      resolution=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,bit_rate -of csv=p=0:s=x "$SOURCE")
      resolution_only=$(echo $resolution | cut -d'x' -f1,2)
      echo -n $resolution_only > $TORK_OUTPUT
    env:
      SOURCE: "{{ inputs.source }}"

  - name: create the master playlist
    image: "amazon/aws-cli:2.13.10"
    networks:
      - minio
    env:
      AWS_ACCESS_KEY_ID: "{{ inputs.accessKeyID }}"
      AWS_SECRET_ACCESS_KEY: "{{ inputs.secretKeyID }}"
      BUCKET_NAME: "{{ inputs.bucketName }}"
      FOLDER_NAME: "{{ inputs.folderName }}"
      ENDPOINT_URL: "{{ inputs.endpointURL }}"
      MAX_RESOLUTION: "{{ tasks.resolution }}"
    run: |
      MAX_WIDTH=$(echo $MAX_RESOLUTION | cut -d'x' -f1)
      MAX_HEIGHT=$(echo $MAX_RESOLUTION | cut -d'x' -f2)

      if [ -z "$MAX_HEIGHT" ]; then
        echo "Error: MAX_HEIGHT is empty"
        exit 1
      fi

      echo "#EXTM3U" > /tmp/playlist.m3u8
      echo "#EXT-X-VERSION:3" >> /tmp/playlist.m3u8
      
      declare -A resolutions
      resolutions[144]="256x144,400000"
      resolutions[240]="426x240,600000"
      resolutions[360]="640x360,800000"
      resolutions[480]="842x480,1400000"
      resolutions[720]="1280x720,2800000"
      resolutions[1080]="1920x1080,5000000"
      resolutions[1440]="2560x1440,9000000"
      resolutions[2160]="3840x2160,14000000"

      for resolution in "\${!resolutions[@]}"; do
        RESOLUTION_INFO=\${resolutions[$resolution]}
        WIDTH=$(echo $RESOLUTION_INFO | cut -d',' -f1)
        BITRATE=$(echo $RESOLUTION_INFO | cut -d',' -f2)

        if [ "$MAX_HEIGHT" -ge "$resolution" ]; then
          echo "#EXT-X-STREAM-INF:BANDWIDTH=\${BITRATE},RESOLUTION=\${WIDTH}" >> /tmp/playlist.m3u8
          echo "\${resolution}p.m3u8" >> /tmp/playlist.m3u8
        fi
      done

      # Upload the playlist to Minio
      aws --endpoint-url $ENDPOINT_URL s3 cp /tmp/playlist.m3u8 s3://$BUCKET_NAME/\${FOLDER_NAME}/playlist.m3u8

  - name: Generate the HLS streams
    parallel:
      tasks:
        - name: Generate 144p HLS stream
          retry: 
            limit: 2
          mounts:
            - type: volume
              target: /tmp
          networks:
            - minio
          run: |
            HEIGHT=144
            MAX_HEIGHT=$(echo $MAX_RESOLUTION | cut -d'x' -f2)
            if [ "$MAX_HEIGHT" -lt "$HEIGHT" ]; then
              echo "Skipping 144p generation: MAX_HEIGHT is less than 144"
              exit 0
            fi
            mkdir -p /tmp/output
            ffmpeg -y -i $SOURCE -vf scale=w=-2:h=144 -c:a aac -ar 48000 -b:a 64k -c:v h264 -profile:v main \
            -crf 20 -g 48 -keyint_min 48 -sc_threshold 0 -b:v 400k -maxrate 440k -bufsize 600k -hls_time 4 \
            -hls_playlist_type vod -hls_segment_filename /tmp/output/144p_%03d.ts /tmp/output/144p.m3u8
          image: datarhei/ffmpeg:latest
          env:
            SOURCE: "{{ inputs.source }}"
            MAX_RESOLUTION: "{{ tasks.resolution }}"
          post:
            - name: upload the chunk to minio
              image: "amazon/aws-cli:2.13.10"
              env:
                AWS_ACCESS_KEY_ID: "{{inputs.accessKeyID}}"
                AWS_SECRET_ACCESS_KEY: "{{inputs.secretKeyID}}"
                BUCKET_NAME: "{{inputs.bucketName}}"
                FOLDER_NAME: "{{ inputs.folderName }}"
                ENDPOINT_URL: "{{inputs.endpointURL}}"
              run: |
                #!/bin/sh
                set -e
                if [ -f /tmp/output/144p.m3u8 ]; then
                  aws --endpoint-url $ENDPOINT_URL s3 sync /tmp/output/ s3://$BUCKET_NAME/$FOLDER_NAME/
                else
                  echo "No 144p output generated, skipping upload"
                fi

        - name: Generate 240p HLS stream
          retry: 
            limit: 2
          mounts:
            - type: volume
              target: /tmp
          networks:
            - minio
          run: |
            HEIGHT=240
            MAX_HEIGHT=$(echo $MAX_RESOLUTION | cut -d'x' -f2)
            if [ "$MAX_HEIGHT" -lt "$HEIGHT" ]; then
              echo "Skipping 240p generation: MAX_HEIGHT is less than 240"
              exit 0
            fi
            mkdir -p /tmp/output
            ffmpeg -y -i $SOURCE -vf scale=w=-2:h=240 -c:a aac -ar 48000 -b:a 64k -c:v h264 -profile:v main \
            -crf 20 -g 48 -keyint_min 48 -sc_threshold 0 -b:v 600k -maxrate 660k -bufsize 750k -hls_time 4 \
            -hls_playlist_type vod -hls_segment_filename /tmp/output/240p_%03d.ts /tmp/output/240p.m3u8
          image: datarhei/ffmpeg:latest
          env:
            SOURCE: "{{ inputs.source }}"
            MAX_RESOLUTION: "{{ tasks.resolution }}"
          post:
            - name: upload the chunk to minio
              image: "amazon/aws-cli:2.13.10"
              env:
                AWS_ACCESS_KEY_ID: "{{inputs.accessKeyID}}"
                AWS_SECRET_ACCESS_KEY: "{{inputs.secretKeyID}}"
                BUCKET_NAME: "{{inputs.bucketName}}"
                FOLDER_NAME: "{{ inputs.folderName }}"
                ENDPOINT_URL: "{{inputs.endpointURL}}"
              run: |
                #!/bin/sh
                set -e
                if [ -f /tmp/output/240p.m3u8 ]; then
                  aws --endpoint-url $ENDPOINT_URL s3 sync /tmp/output/ s3://$BUCKET_NAME/$FOLDER_NAME/
                else
                  echo "No 240p output generated, skipping upload"
                fi

        - name: Generate 360p HLS stream
          retry: 
            limit: 2
          mounts:
            - type: volume
              target: /tmp
          networks:
            - minio
          run: |
            HEIGHT=360
            MAX_HEIGHT=$(echo $MAX_RESOLUTION | cut -d'x' -f2)
            if [ "$MAX_HEIGHT" -lt "$HEIGHT" ]; then
              echo "Skipping 360p generation: MAX_HEIGHT is less than 360"
              exit 0
            fi
            mkdir -p /tmp/output
            ffmpeg -y -i $SOURCE -vf scale=w=-2:h=360 -c:a aac -ar 48000 -b:a 96k -c:v h264 -profile:v main \
            -crf 20 -g 48 -keyint_min 48 -sc_threshold 0 -b:v 800k -maxrate 856k -bufsize 1200k -hls_time 4 \
            -hls_playlist_type vod -hls_segment_filename /tmp/output/360p_%03d.ts /tmp/output/360p.m3u8
          image: datarhei/ffmpeg:latest
          env:
            SOURCE: "{{ inputs.source }}"
            MAX_RESOLUTION: "{{ tasks.resolution }}"
          post:
            - name: upload the chunk to minio
              image: "amazon/aws-cli:2.13.10"
              env:
                AWS_ACCESS_KEY_ID: "{{inputs.accessKeyID}}"
                AWS_SECRET_ACCESS_KEY: "{{inputs.secretKeyID}}"
                BUCKET_NAME: "{{inputs.bucketName}}"
                FOLDER_NAME: "{{ inputs.folderName }}"
                ENDPOINT_URL: "{{inputs.endpointURL}}"
              run: |
                #!/bin/sh
                set -e
                if [ -f /tmp/output/360p.m3u8 ]; then
                  aws --endpoint-url $ENDPOINT_URL s3 sync /tmp/output/ s3://$BUCKET_NAME/$FOLDER_NAME/
                else
                  echo "No 360p output generated, skipping upload"
                fi

        - name: Generate 480p HLS stream
          retry: 
            limit: 2
          mounts:
            - type: volume
              target: /tmp
          networks:
            - minio
          run: |
            HEIGHT=480
            MAX_HEIGHT=$(echo $MAX_RESOLUTION | cut -d'x' -f2)
            if [ "$MAX_HEIGHT" -lt "$HEIGHT" ]; then
              echo "Skipping 480p generation: MAX_HEIGHT is less than 480"
              exit 0
            fi
            mkdir -p /tmp/output
            ffmpeg -y -i $SOURCE -vf scale=w=-2:h=480 -c:a aac -ar 48000 -b:a 128k -c:v h264 -profile:v main \
            -crf 20 -g 48 -keyint_min 48 -sc_threshold 0 -b:v 1400k -maxrate 1470k -bufsize 2500k -hls_time 4 \
            -hls_playlist_type vod -hls_segment_filename /tmp/output/480p_%03d.ts /tmp/output/480p.m3u8
          image: datarhei/ffmpeg:latest
          env:
            SOURCE: "{{ inputs.source }}"
            MAX_RESOLUTION: "{{ tasks.resolution }}"
          post:
            - name: upload the chunk to minio
              image: "amazon/aws-cli:2.13.10"
              env:
                AWS_ACCESS_KEY_ID: "{{inputs.accessKeyID}}"
                AWS_SECRET_ACCESS_KEY: "{{inputs.secretKeyID}}"
                BUCKET_NAME: "{{inputs.bucketName}}"
                FOLDER_NAME: "{{ inputs.folderName }}"
                ENDPOINT_URL: "{{inputs.endpointURL}}"
              run: |
                #!/bin/sh
                set -e
                if [ -f /tmp/output/480p.m3u8 ]; then
                  aws --endpoint-url $ENDPOINT_URL s3 sync /tmp/output/ s3://$BUCKET_NAME/$FOLDER_NAME/
                else
                  echo "No 480p output generated, skipping upload"
                fi

        - name: Generate 720p HLS stream
          retry: 
            limit: 2
          mounts:
            - type: volume
              target: /tmp
          networks:
            - minio
          run: |
            HEIGHT=720
            MAX_HEIGHT=$(echo $MAX_RESOLUTION | cut -d'x' -f2)
            if [ "$MAX_HEIGHT" -lt "$HEIGHT" ]; then
              echo "Skipping 720p generation: MAX_HEIGHT is less than 720"
              exit 0
            fi
            mkdir -p /tmp/output
            ffmpeg -y -i $SOURCE -vf scale=w=-2:h=720 -c:a aac -ar 48000 -b:a 192k -c:v h264 -profile:v main \
            -crf 20 -g 48 -keyint_min 48 -sc_threshold 0 -b:v 2800k -maxrate 2980k -bufsize 5000k -hls_time 4 \
            -hls_playlist_type vod -hls_segment_filename /tmp/output/720p_%03d.ts /tmp/output/720p.m3u8
          image: datarhei/ffmpeg:latest
          env:
            SOURCE: "{{ inputs.source }}"
            MAX_RESOLUTION: "{{ tasks.resolution }}"
          post:
            - name: upload the chunk to minio
              image: "amazon/aws-cli:2.13.10"
              env:
                AWS_ACCESS_KEY_ID: "{{inputs.accessKeyID}}"
                AWS_SECRET_ACCESS_KEY: "{{inputs.secretKeyID}}"
                BUCKET_NAME: "{{inputs.bucketName}}"
                FOLDER_NAME: "{{ inputs.folderName }}"
                ENDPOINT_URL: "{{inputs.endpointURL}}"
              run: |
                #!/bin/sh
                set -e
                if [ -f /tmp/output/720p.m3u8 ]; then
                  aws --endpoint-url $ENDPOINT_URL s3 sync /tmp/output/ s3://$BUCKET_NAME/$FOLDER_NAME/
                else
                  echo "No 720p output generated, skipping upload"
                fi

        - name: Generate 1080p HLS stream
          retry: 
            limit: 2
          mounts:
            - type: volume
              target: /tmp
          networks:
            - minio
          run: |
            HEIGHT=1080
            MAX_HEIGHT=$(echo $MAX_RESOLUTION | cut -d'x' -f2)
            if [ "$MAX_HEIGHT" -lt "$HEIGHT" ]; then
              echo "Skipping 1080p generation: MAX_HEIGHT is less than 1080"
              exit 0
            fi
            mkdir -p /tmp/output
            ffmpeg -y -i $SOURCE -vf scale=w=-2:h=1080 -c:a aac -ar 48000 -b:a 192k -c:v h264 -profile:v main \
            -crf 20 -g 48 -keyint_min 48 -sc_threshold 0 -b:v 5000k -maxrate 5300k -bufsize 8000k -hls_time 4 \
            -hls_playlist_type vod -hls_segment_filename /tmp/output/1080p_%03d.ts /tmp/output/1080p.m3u8
          image: datarhei/ffmpeg:latest
          env:
            SOURCE: "{{ inputs.source }}"
            MAX_RESOLUTION: "{{ tasks.resolution }}"
          post:
            - name: upload the chunk to minio
              image: "amazon/aws-cli:2.13.10"
              env:
                AWS_ACCESS_KEY_ID: "{{inputs.accessKeyID}}"
                AWS_SECRET_ACCESS_KEY: "{{inputs.secretKeyID}}"
                BUCKET_NAME: "{{inputs.bucketName}}"
                FOLDER_NAME: "{{ inputs.folderName }}"
                ENDPOINT_URL: "{{inputs.endpointURL}}"
              run: |
                #!/bin/sh
                set -e
                if [ -f /tmp/output/1080p.m3u8 ]; then
                  aws --endpoint-url $ENDPOINT_URL s3 sync /tmp/output/ s3://$BUCKET_NAME/$FOLDER_NAME/
                else
                  echo "No 1080p output generated, skipping upload"
                fi

        - name: Generate 1440p HLS stream
          retry: 
            limit: 2
          mounts:
            - type: volume
              target: /tmp
          networks:
            - minio
          run: |
            HEIGHT=1440
            MAX_HEIGHT=$(echo $MAX_RESOLUTION | cut -d'x' -f2)
            if [ "$MAX_HEIGHT" -lt "$HEIGHT" ]; then
              echo "Skipping 1440p generation: MAX_HEIGHT is less than 1440"
              exit 0
            fi
            mkdir -p /tmp/output
            ffmpeg -y -i $SOURCE -vf scale=w=-2:h=1440 -c:a aac -ar 48000 -b:a 192k -c:v h264 -profile:v main \
            -crf 20 -g 48 -keyint_min 48 -sc_threshold 0 -b:v 9000k -maxrate 9450k -bufsize 12000k -hls_time 4 \
            -hls_playlist_type vod -hls_segment_filename /tmp/output/1440p_%03d.ts /tmp/output/1440p.m3u8
          image: datarhei/ffmpeg:latest
          env:
            SOURCE: "{{ inputs.source }}"
            MAX_RESOLUTION: "{{ tasks.resolution }}"
          post:
            - name: upload the chunk to minio
              image: "amazon/aws-cli:2.13.10"
              env:
                AWS_ACCESS_KEY_ID: "{{inputs.accessKeyID}}"
                AWS_SECRET_ACCESS_KEY: "{{inputs.secretKeyID}}"
                BUCKET_NAME: "{{inputs.bucketName}}"
                FOLDER_NAME: "{{ inputs.folderName }}"
                ENDPOINT_URL: "{{inputs.endpointURL}}"
              run: |
                #!/bin/sh
                set -e
                if [ -f /tmp/output/1440p.m3u8 ]; then
                  aws --endpoint-url $ENDPOINT_URL s3 sync /tmp/output/ s3://$BUCKET_NAME/$FOLDER_NAME/
                else
                  echo "No 1440p output generated, skipping upload"
                fi

        - name: Generate 2160p HLS stream
          retry: 
            limit: 2
          mounts:
            - type: volume
              target: /tmp
          networks:
            - minio
          run: |
            HEIGHT=2160
            MAX_HEIGHT=$(echo $MAX_RESOLUTION | cut -d'x' -f2)
            if [ "$MAX_HEIGHT" -lt "$HEIGHT" ]; then
              echo "Skipping 2160p generation: MAX_HEIGHT is less than 2160"
              exit 0
            fi
            mkdir -p /tmp/output
            ffmpeg -y -i $SOURCE -vf scale=w=-2:h=2160 -c:a aac -ar 48000 -b:a 192k -c:v h264 -profile:v main \
            -crf 20 -g 48 -keyint_min 48 -sc_threshold 0 -b:v 14000k -maxrate 14700k -bufsize 20000k -hls_time 4 \
            -hls_playlist_type vod -hls_segment_filename /tmp/output/2160p_%03d.ts /tmp/output/2160p.m3u8
          image: datarhei/ffmpeg:latest
          env:
            SOURCE: "{{ inputs.source }}"
            MAX_RESOLUTION: "{{ tasks.resolution }}"
          post:
            - name: upload the chunk to minio
              image: "amazon/aws-cli:2.13.10"
              env:
                AWS_ACCESS_KEY_ID: "{{inputs.accessKeyID}}"
                AWS_SECRET_ACCESS_KEY: "{{inputs.secretKeyID}}"
                BUCKET_NAME: "{{inputs.bucketName}}"
                FOLDER_NAME: "{{inputs.folderName}}"
                ENDPOINT_URL: "{{inputs.endpointURL}}"
              run: |
                #!/bin/sh
                set -e
                if [ -f /tmp/output/2160p.m3u8 ]; then
                  aws --endpoint-url $ENDPOINT_URL s3 sync /tmp/output/ s3://$BUCKET_NAME/$FOLDER_NAME/
                else
                  echo "No 2160p output generated, skipping upload"
                fi
  `;
    console.log("Sending request to Tork...");
    // console.log("Convert script:", convertScript);
    
  const response = await fetch(process.env.TORK_ENDPOINT! as string, {
    method: "POST",
    headers: {
      "Content-Type": "text/yaml",
    },
    body: convertScript,
  });
  return await response.json();
};
