(function(NYTG_ASSETS, NYTG_BIG_ASSETS, $, _, PageManager, pictureBook, d3, queue) {

  var isIphone = /iPad|iPhone/.test(navigator.userAgent),
        isAndroid = /Android/.test(navigator.userAgent),
        isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/.test(navigator.userAgent),
        isLegacyMobile = checkLegacyMobile(),
        containerElement,
        scroller = {};

    var videoLoaded = { 'g-top-video':false, 'g-bottom-video':false};

    if (isLegacyMobile) {
      document.documentElement.className += " is-legacy-mobile";
      scroller = new FTScroller(document.body, {
          scrollbars: false,
          scrollingX: false,
          maxFlingDuration: 250
      });
    }

    // load video as quickly as possible, so avoid jQuery + frameworks
    function loadVideo(node) {
      var selector = window.innerWidth <= 600 ? ".video-mobile" : ".video-desktop";
      if (isAndroid) selector = ".video-desktop";
      var html = node.querySelector(selector).innerHTML.slice(5, -5);
      if (isAndroid) html = html.replace(/-900/g, "-320");

      node.innerHTML = html;
      // we don't want autoplay on iPhone, because it takes over the screen
      if (!isIphone) node.querySelector("video").setAttribute("autoplay", "");
      if (isIphone || isAndroid)  node.querySelector("video").setAttribute("controls", "");

      videoLoaded[node.id] = true;
    }

    function checkLegacyMobile() {
      return isMobile && !isModernMobile();
    }

    // iOS8 Safari, iOS9 Safari and Twitter WebView support more robust scroll events
    function isModernMobile() {
      return (navigator.userAgent.match(/(iPad|iPhone);.*CPU.*OS [8|9]_\d/i) && navigator.userAgent.indexOf("Safari") > -1 && navigator.userAgent.indexOf("CriOS") == -1)
             || navigator.userAgent.indexOf('Twitter') > -1;
    }


    
  var startZoom    = { 'greenland': 0.00304, 'moulins': 70.0 },
      zoom         = 0.00304,
      targetZoom   = 0.00304,
      focus        = [0.5, 0.5],
      targetFocus  = [0.5, 0.5],
      drunkenness  = 0.015,
      mobileFocusY = 0.6;

  var zoomerConfigs = {};

  var lastActiveBook = '', zoomScale, zoomDir;

  var windowWidth = window.innerWidth;
  var smallScreen = windowWidth < 600 ? true : false;

  if (isLegacyMobile) {
    zoomDir = 'zoom-375';
  } else if (windowWidth < 600) {
    zoomDir = 'zoom-640';
  } else if (windowWidth < 1050) {
    zoomDir = 'zoom-1000';
  } else {
    zoomDir = 'zoom-2000';
  }



  var loadedImages = {};
  var imageList = getImageList();

  var pb = new pictureBook();

  function boot() {
    // mobile needs a bit more magnification, because of how
    // screen aspect ratios force image sizing.
    if (smallScreen) {
      startZoom.greenland = startZoom.greenland * 1.5;
      startZoom.moulins   = startZoom.moulins   * 1.5;
    };

    initZoomer('greenland');
    initZoomer('moulins');
    pb.init(bookScroll);
    PageManager.on('nyt:page-resize', resize);
  }

  // Picture Book init
  function bookScroll() {
    // console.time("bookScroll");
    var b = pb.activeBook;

    if (lastActiveBook !== b) { // if book changed

      lastActiveBook = b;

      var zooms = [],
          foci  = [],
          positions = [];

      // push an array of page positions and their corresponding zooms
      _.each(b.pages, function(p) {
        positions.push(p.position);
        
        zooms.push(+p.node.getAttribute("data-pb-zoom"));

        var fX = +p.node.getAttribute("data-pb-focus-x"),
            fY = +p.node.getAttribute("data-pb-focus-y");

        foci.push([fX, fY]);

      })

      zoomScale  = d3.scale.linear().domain(positions).range(zooms).clamp(true);
      focusScale = d3.scale.linear().domain(positions).range(foci).clamp(true);

      // set the zoom directly if the book has changed
      // (this avoids 'animating' from the last book's zoom to the current.)
      zoom = smallScreen ? zoomScale(b.progress)*1.5 : zoomScale(b.progress);

      // start and end zoom for whole book.
      // var Zaa = +b.pages[0].node.getAttribute("data-pb-zoom"),
          // Zbb = +b.pages[b.pages.length-1].node.getAttribute("data-pb-zoom");
    }

    var Za = +b.minPage.node.getAttribute("data-pb-zoom"),
        Zb = +b.maxPage.node.getAttribute("data-pb-zoom");

    // targetZoom = Za + (Zb - Za) * (1 - b.remainder); // if using per-page remainders (leads to stairstepping)
    targetZoom  = zoomScale(b.progress); // if using d3 linear interp for book as a whole
    targetFocus = focusScale(b.progress);

    // mobile needs a bit more magnification, because of how
    // screen aspect ratios force image sizing.
    if (smallScreen) targetZoom = targetZoom*1.5;

    // disabled bc janky
      // var closestToCenter = Math.abs(b.minPage.distance) <= Math.abs(b.maxPage.distance) ? b.minPage : b.maxPage;

      // d3.selectAll('.g-picture-book__page').classed('active',false);

      // var threshholds = smallScreen ? [0.1, 0.4] : [0.1, 0.9]; // determines vertical positions at which text fades in

      // if (closestToCenter.progress > threshholds[0] && closestToCenter.progress < threshholds[1]) {
      //   d3.select(closestToCenter.node).classed('active',true)
      // }

    // console.log('p ' + round(b.progress,2) + '   ' + 'z ' + round(targetZoom,2))
    // console.timeEnd("bookScroll")
  };

  function initZoomer(slug) {
    var config = c = {};

    c.slug = slug;

    c.container = d3.select('#zoomer-'+slug);
    c.zoomer    = c.container.select(".g-zoomer");
    c.width     = parseInt(c.zoomer.style('width'));
    c.height    = parseInt(c.zoomer.style('height'));

    c.canvas    = c.zoomer.append("canvas")
      .datum(function() { return {'slug': slug }})
      .attr("width",   c.width)
      .attr("height",  c.height)
      .style("width",  c.width+'px')
      .style("height", c.height+'px');

    c.ctx = c.canvas.node().getContext('2d');

    loadZoomerImages(config);
  }

  function loadZoomerImages(config) {
    var slug = config.slug;
    var q    = queue(1);
    imageList[slug].forEach(function(t) {
      q.defer(loadImage, t);
    });
    q.awaitAll(imagesReady);

    function imagesReady(error, results) {
      ready(error, results, config);
    }
  }

  function ready(error, results, config) {
    zoomerConfigs[config.slug] = config;
    animate(config);
  }

  function resize() {
    // when canvas is resized it gets cleared
    // can comment this back it when it redraws after resize  — TG

    // windowWidth = window.innerWidth;
    // smallScreen = windowWidth < 600 ? true : false;

    // d3.selectAll('.g-zoomer')
    //   .selectAll('canvas')
    //   .datum(function(d) {
    //     var p = d3.select(this.parentNode);
    //     return {
    //       'slug': d.slug,
    //       'w': p.style('width'), 
    //       'h': p.style('height'),
    //       'p': p
    //     };
    //   })
    //   .attr( 'width',  function(d) { return d.w })
    //   .attr( 'height', function(d) { return d.h })
    //   .style('width',  function(d) { return d.w })
    //   .style('height', function(d) { return d.h })
    //   .each(function(d) {
    //     var z    = zoomerConfigs[d.slug];
    //     z.width  = parseInt(d.w);
    //     z.height = parseInt(d.h);
    //   });

  };

  function animate(config) {
    // so that there's something on the canvas prior to scrolling into the thing

    draw(startZoom[config.slug], focus, config);

    function loop() {
      // only run through the loop if it's a loop for the book you're currently looking at.

      var atTarget = false;

      if (pb.activeBook && config.slug === pb.activeBook.slug && !atTarget) {

        var velocity = {
          z: (targetZoom - zoom),
          f: [ (targetFocus[0] - focus[0]) , (targetFocus[1] - focus[1]) ]
        };

        // no idea why this is necessary - use a different drunkenness if zooming out otherwise
        // it goes v e e r r r y y y s lll o o oo w w ll  yyy
        var drunk = velocity.z < 0 ? Math.pow(drunkenness,0.65) : drunkenness;

        velocity.z = velocity.z * drunk;
        velocity.f = [ ( velocity.f[0] * drunk ) , ( velocity.f[1] * drunk ) ];

        zoom  = zoom + velocity.z;
        focus = [ (focus[0] + velocity.f[0]) , (focus[1] + velocity.f[1]) ];

        draw(zoom, focus, config);
      }

      requestAnimationFrame(loop);

    }

    requestAnimationFrame(loop);
  }

  function draw(zoom, focus, config) {
    
    var slug   = config.slug,
        width  = config.width,
        height = config.height,
        ctx    = config.ctx;

    config.zoom = zoom;

    // console.log('DRAW '+slug + ' ' + zoom)

    // base scaling needs to change based on window aspect ratio,
    // to get a bg: "cover" effect (which helps avoid edges of images being visible)
    config.coverDim = window.innerWidth > window.innerHeight ? width : height;
    var coverDim = config.coverDim;

    var chosen = whichImagesToUse(zoom, slug);

    var hi = chosen.hiImage,
        lo = chosen.loImage,
        bg = chosen.bgImage;

    if (smallScreen) focus[1] = mobileFocusY;

    var pivot = [focus[0]*width, focus[1]*height]; // center of zoominess

    var motionBlurAmount = 0; // 0 to 1, lo to hi blur

    // stopgap for early in greenland zoomy when there's no image covering one part of the canvas
    if (smallScreen && zoom < 0.02 && config.slug === 'greenland') {
      ctx.fillStyle   = '#152735';
      ctx.fillRect(0, 0, width, height);
    }


    // TODO rather than scaling entire image,
    // might be more efficient to cookie cut the subset of the image that I need
    // and then scale+draw that at full screen width
    // (so no overhang at edges)

    // only draw background image if the 'lo' image doesn't fully cover the screen.
    // ("covers the screen" would be zoom * scale === 1, but we're offsetting a bit on phones,
    // so use 1.2 to give some wiggle room.)
    var needBackground = zoom * lo.scale < 1.2 ? true : false;

    ctx.save();
      ctx.translate(pivot[0], pivot[1]);

      ctx.scale(zoom, zoom)

      if (needBackground) {
        ctx.save();
          ctx.scale(bg.scale, bg.scale)
          ctx.globalAlpha = (1-motionBlurAmount);
          ctx.drawImage(bg.imageObj, -coverDim/2, -coverDim/2, coverDim, coverDim);
        ctx.restore();
      }


      ctx.save();
        ctx.scale(lo.scale, lo.scale)
        ctx.globalAlpha = (1-motionBlurAmount);
        ctx.drawImage(lo.imageObj, -coverDim/2, -coverDim/2, coverDim, coverDim);
      ctx.restore();



      ctx.save();
        ctx.scale(hi.scale, hi.scale)
        ctx.globalAlpha = chosen.progress*(1-motionBlurAmount);
        ctx.drawImage(hi.imageObj, -coverDim/2, -coverDim/2, coverDim, coverDim);
      ctx.restore();


      // todo this might be more effictient can get working

        // ctx.globalAlpha = (1-motionBlurAmount);
        // var Z = 1/(lo.scale*zoom),
        //     W = lo.imageObj.width,
        //     H = lo.imageObj.height;
        // console.log(coverDim)
        // ctx.drawImage(
        //   lo.imageObj,
        //   (W*Z)/2, (H*Z)/2, W*Z, H*Z,
        //   -coverDim/2, -coverDim/2, coverDim, coverDim
        // );

    ctx.restore();

    if (zoom < 0.02 && config.slug === 'greenland') {
      drawGreenlandLabel(config);
    }

    if (zoom > 0.02 && config.slug === 'greenland') {
      drawScaleBox(config);
    }

    if (zoom > 0.10 && zoom < 3.0 && config.slug === 'moulins') {
      drawCampCircle(config);
      drawMoulinAnnotations(config);
    }
    // console.timeEnd("draw");
  }

  var fontSize   = smallScreen ? 14 : 15,
      lineHeight = smallScreen ? fontSize * 1.2 : fontSize * 1.4,
      lightFontString = '300 '+ fontSize +"px nyt-franklin",
      boldFontString  = '600 '+ fontSize +"px nyt-franklin";

  function drawGreenlandLabel(config) {
    var ctx = config.ctx;
    var zoom = config.zoom;

    // fades in box at certain zoom level
    var opacity = d3.scale.linear().domain([0,0.02]).range([1,0]);
    var O = opacity(zoom);

    var pivot = [focus[0] * config.width, focus[1] * config.height];
    var factor = f = (config.coverDim/200) * zoom; // todo why 200

    ctx.font = '300 '+ fontSize +'px nyt-franklin';

    var x, y;

    var labels = [
      {
        name:  'GREENLAND',
        color: hexa('#cccccc', O),
        blend: 'multiply',
        align: 'center',
        font:  '300 '+rescale(18)+'px nyt-franklin',
        x:     3500, y:    -7000,
        mfont: '300 12px nyt-franklin',
        mx:    3100, my:   -12000,
      },
      {
        name:  'ICELAND',
        color: hexa('#777777', O),
        blend: 'normal',
        align: 'end',
        font:  '300 '+rescale(14)+'px nyt-franklin',
        x:     17000, y:    -3500
      },
      {
        name:  'CANADA',
        color: hexa('#999999', O),
        blend: 'normal',
        align: 'center',
        font:  '300 '+rescale(14)+'px nyt-franklin',
        x:     -18000, y:    12000
      },
      {
        name:  'Atlantic Ocean',
        color: hexa('#777777', O),
        blend: 'normal',
        align: 'center',
        font:  'italic '+rescale(16)+'px nyt-franklin',
        x:     13000, y:    15000
      },
      {
        name:  'Hudson Bay',
        color: hexa('#777777', O),
        blend: 'normal',
        align: 'center',
        font:  'italic '+rescale(16)+'px nyt-franklin',
        x:     -28000, y:    -0
      }
    ]

    var cities = [
      {
        name:  'Nuuk',
        color: hexa('#aaaaaa', O),
        blend: 'normal',
        align: 'right',
        font:  '300 '+rescale(13)+'px nyt-franklin',
        x:     -1800, y:    4200
      },
      {
        name:  'Reykjavik',
        color: hexa('#aaaaaa', O),
        blend: 'normal',
        align: 'right',
        font:  '300 '+rescale(13)+'px nyt-franklin',
        x:     17500, y:    200
      }
    ]

    ctx.save();
      ctx.translate(pivot[0], pivot[1]);

      _.each(labels, function(l) {
        if (smallScreen && typeof l.mfont === 'undefined') return;

        var x    = smallScreen ? l.mx : l.x,
            y    = smallScreen ? l.my : l.y,
            font = smallScreen ? l.mfont : l.font;

        ctx.save();
          setAnnotationStyles(ctx, l.color, l.blend, font);
          ctx.textAlign=l.align;
          ctx.fillText(l.name, x*f, y*f);
        ctx.restore();
      })

      _.each(cities, function(l) {
        if (smallScreen && typeof l.mfont === 'undefined') return;

        var x    = smallScreen ? l.mx : l.x,
            y    = smallScreen ? l.my : l.y,
            font = smallScreen ? l.mfont : l.font;

        ctx.save();
          ctx.fillStyle = 'rgba(255,255,255,'+(1*O)+')';
          ctx.strokeStyle = 'rgba(0,0,0,'+(0.5*O)+')';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x*f, y*f, 2, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.fill();

          setAnnotationStyles(ctx, l.color, l.blend, font);          
          
          ctx.textAlign=l.align;
          ctx.fillText(l.name, (x-150)*f, (y+50)*f);
        ctx.restore();
      })

    ctx.restore();

    function rescale(fontSize) {
      // only allow fonts to scale down based on screen width
      var target = fontSize * config.coverDim/1000;
      return target < fontSize ? target : fontSize;
    }
  }

  function drawScaleBox(config) {
    var ctx = config.ctx;
    var zoom = config.zoom;

    // milesFactor relates 150px at zoom level "1" to distance in miles on the ground.
    var milesFactor = 1.41123;
    var feetInMile = 5280;

    // milesFactor assumes the image is 1000px wide at scale "1".
    // but that isn't the case - width at scale 1 is determined by screen width or height.
    // so, need to compensate for how images are being scaled to cover the screen.
    var baseFactor = 1000/config.coverDim;
    // var baseFactor = 1;

    var miles = (1/zoom)*milesFactor*baseFactor;
    var feet  = miles*feetInMile;

    // fades in box at certain zoom level
    var opacity = d3.scale.linear().domain([0.02,0.05]).range([0,1]);
    var color = hexa('#ff0000',opacity(zoom));

    // Choose feet or miles
    var scale = (miles >= 4)    ? round(miles,0)           + ' miles' :
                (round(miles,1) === 1) ? round(miles,1)    + ' mile'  :
                (miles >= 1.0)  ? round(miles,1)           + ' miles' :
                                  addCommas(round(feet,0)) + ' feet';
    // var scale = addCommas(round(feet,0)) + ' feet';

    var pivot = [focus[0] * config.width, focus[1] * config.height];

    ctx.save();
      setAnnotationStyles(ctx, color);
      ctx.translate(pivot[0], pivot[1]);
      ctx.strokeRect (-75, -75, 150, 150);
      // TODO fillText might be slowing things down
      // could use this technique http://simonsarris.com/blog/322-canvas-drawtext-considered-harmful
      // which uses drawImage and a tiny canvas to redraw text, instead of fillText
      ctx.fillText('Each side is '+ scale +'.',  -75, 75+lineHeight);
    ctx.restore();
  }

  function drawCampCircle(config) {
    var ctx = config.ctx;
    var zoom = config.zoom;

    // fades in circle at certain zoom level
    var opacity = d3.scale.linear().domain([2.0,0.5]).range([0,1]),
        color   = hexa('#ff0000',opacity(zoom));

    var pivot = [focus[0] * config.width, focus[1] * config.height];

    ctx.save();
      setAnnotationStyles(ctx, color);
      ctx.translate( pivot[0], pivot[1] );
      ctx.beginPath();

      var r = 15*zoom;
      
      ctx.arc(0, 0, r, 0, 2 * Math.PI); // * zoom relates circle size to zoom level
      ctx.stroke();
      
      // tweaking text positions at certain sizes
      var tX = windowWidth < 945 ? r-10 : r+5;
      var tY = windowWidth < 945 ? lineHeight/4-r-10 : lineHeight/4 ;
      ctx.fillText('Location of camp', tX, tY);
    ctx.restore();
  }

  function drawMoulinAnnotations(config) {
    var ctx = config.ctx;
    var zoom = config.zoom;

    // fades in circle at certain zoom level
    var opacity = d3.scale.linear().domain([0.42,0.25]).range([0,1]).clamp(true),
        color   = hexa('#ff0000',opacity(zoom));

    var pivot = [focus[0] * config.width, focus[1] * config.height];

    ctx.save();
      setAnnotationStyles(ctx, color);
      ctx.translate( pivot[0], pivot[1] );
        // ctx.scale(zoom,zoom)
      ctx.beginPath();

      // locations are in pixel coordinates in relation to z-moulin-0.2
      // with a little manual fiddling for some reason
      //   (in the ai file, 1000px w/h; not in the double-res jpg)
      // factor is the scale multiplier for that reference zoom level,(obtained through trial and error)
      // multiplied by the current zoom level.
      // could alternatively do this with ctx.scale(zoom,zoom) as commented above,
      // but that introduces weirdness with stroke widths, font sizes, etc.
      var factor = f = (config.coverDim/200) * zoom; // todo why 200

      // flow rate circle
      var x = 75.492, y = 98.136, r = (18.9925 + 2);
      x = x*f; y = y*f; r = r*f;

      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.stroke();

      var offset, tX, tY, lineStart, lineEnd;

      if (smallScreen) {
      
        offset    = [ r*3, r+lineOffset(3)+0 ];
        tX        = x + offset[0];
        tY        = y + offset[1];
        lineStart = [ x, y+r ];
        lineEnd   = [ x, y+r+5 ];
      
      } else {
      
        offset    = [ r+15, lineHeight/4 ];
        tX        = x + offset[0];
        tY        = y + offset[1];
        lineStart = [ tX, tY-lineHeight/4 ];
        lineEnd   = [ tX-offset[0]+r , tY-lineHeight/4 ];
      
      };

      // var tX = x + offset[0],
          // tY = y + offset[1];

      setAnnotationStyles(ctx, hexa('#222222', opacity(zoom)));

      if (smallScreen) {

        ctx.textAlign= 'right';
      
        ctx.font        = lightFontString;

        ctx.beginPath();
        ctx.moveTo(lineStart[0], lineStart[1]);
        ctx.lineTo(lineEnd[0],   lineEnd[1]);
        ctx.stroke();
        ctx.fillText('About 95,000 gallons per minute.',  tX, tY + lineOffset(-2));

        ctx.font        = boldFontString;

        ctx.fillText('Circles show flow rates measured',  tX, tY + lineOffset(-1));
        ctx.fillText('by satellite imagery in 2012.',  tX, tY + lineOffset(0));
     
      } else {

        ctx.textAlign= 'left';
        
        ctx.font        = boldFontString;

        ctx.fillText('Circles show flow rates measured',  tX, tY + lineOffset(-2));
        ctx.fillText('by satellite imagery in 2012.',  tX, tY + lineOffset(-1));

        ctx.font        = lightFontString;

        ctx.beginPath();
        ctx.moveTo(lineStart[0], lineStart[1]);
        ctx.lineTo(lineEnd[0],   lineEnd[1]);
        ctx.stroke();
        ctx.fillText('About 95,000 gallons per minute.',  tX, tY + lineOffset(0));
      
      };
      
      // Missing data note

      var offset, tX, tY;

      if (smallScreen) {
        offset    = [ r*3, r+lineOffset(3)+10 ];
        var yCompensate = config.height*(mobileFocusY-0.5); // compensates for any vertical shift in the zoom focal point for mobile
        tX        = config.width/2  - 5;
        tY        = config.height/2 - lineOffset(3) - yCompensate;
      } else {
        offset    = [ r+15, lineHeight/4 ];
        tX        = config.width/2  - 25;
        tY        = config.height/2 - lineOffset(3)-10;
      };

      color = hexa('#222222', opacity(zoom));
      setAnnotationStyles(ctx, color);

      ctx.textAlign="right";
      ctx.fillText('No flow data is available outside',                 tX, tY + lineOffset(0));
      ctx.fillText('the satellite survey area. Flows measured',         tX, tY + lineOffset(1));
      ctx.fillText('by satellite can differ from ground measurements.', tX, tY + lineOffset(2));
    ctx.restore();


  }

  function lineOffset(num) { return num * lineHeight; }

  function setAnnotationStyles(ctx, color, blend, font) {
    ctx.globalCompositeOperation = blend || "multiply";
    ctx.globalAlpha = 0.9;
    ctx.lineWidth   = 1.5;
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.font        = font || lightFontString;
  }

  function whichImagesToUse(curZoom, slug) {
    var loImage, bgImage, hiImage, lowestSeen, highestSeen, progress;

    // todo maybe fix this 90%ing of curZoom?
    // it's a hacky fix to keep the "background", zoomed out image at a given zoom level
    // from disappearing too soon (before it's fully occluded by the next closest image)

    curZoom *= 0.90;

    _.each(imageList[slug],function(i) {
      var showAt = i.showAt = 1/i.scale;

      var distance = Math.abs(showAt-curZoom);

      var loUndefined = typeof loImage === 'undefined',
          bgUndefined = typeof bgImage === 'undefined',
          hiUndefined = typeof hiImage === 'undefined';

      if ( showAt <= curZoom && (loUndefined || distance < loImage.distance) ) {
        loImage = i;
        loImage.distance = distance;
        if (i-1 >= 0) {
          bgImage = i-1;
        }
      }
      if ( showAt >= curZoom && (hiUndefined || distance < hiImage.distance) ) {
        hiImage = i;
        hiImage.distance = distance;
      };

      if (loUndefined || showAt < lowestSeen.showAt) {
        lowestSeen = i;
        lowestSeen.distance = distance;
      };

      if (hiUndefined || showAt > highestSeen.showAt) {
        highestSeen = i;
        highestSeen.distance = distance;
      };

    });

    if (typeof loImage === 'undefined') loImage = lowestSeen;
    if (typeof bgImage === 'undefined') bgImage = lowestSeen;
    if (typeof hiImage === 'undefined') hiImage = highestSeen;

    progress = (curZoom-loImage.showAt)/(hiImage.showAt - loImage.showAt);

    progress = isNaN(progress)     ? 0 :
               !isFinite(progress) ? 1 :
               progress;

    return { loImage: loImage, bgImage: bgImage, hiImage: hiImage, progress: progress };
  }


// utility
  function getImageList() {
    return {
      'greenland': [
        { 'name': 'z-0.00304.jpg',
          'scale': 1/0.00304  },
        { 'name': 'z-0.00912.jpg',
          'scale': 1/0.00912  },
        { 'name': 'z-0.0228.jpg',
          'scale': 1/0.0228  },
        { 'name': 'z-0.12.jpg',
          'scale': 1/0.12  },
        { 'name': 'z-0.2.jpg',
          'scale': 1/0.2  },
        { 'name': 'z-1.jpg',
          'scale': 1/1  },
        { 'name': 'z-3.560.jpg',
          'scale': 1/3.560  },
        { 'name': 'z-15.221.jpg',
          'scale': 1/15.221  },
        { 'name': 'z-50.351.jpg',
          'scale': 1/50.351  },
        { 'name': 'z-124.568.jpg',
          'scale': 1/124.568  },
      ],
      'moulins': [
        { 'name': 'z-0.00912.jpg',
          'scale': 1/0.00912  },
        { 'name': 'z-moulin-0.11306.jpg',
          'scale': 1/0.11306  },
        { 'name': 'z-moulin-0.2.jpg',
          'scale': 1/0.2 },
        { 'name': 'z-moulin-0.4.jpg',
          'scale': 1/0.4 },
        { 'name': 'z-moulin-1.jpg',
          'scale': 1/1  },
        { 'name': 'z-3.560.jpg',
          'scale': 1/3.560  },
        { 'name': 'z-15.221.jpg',
          'scale': 1/15.221  },
        { 'name': 'z-50.351.jpg',
          'scale': 1/50.351  },
        { 'name': 'z-124.568.jpg',
          'scale': 1/124.568  },
      ]
    }
  }

  function loadImage(t, cb) {
    var imagePath = NYTG_ASSETS + zoomDir +'/'+ t.name;

    // to ensure images arent double-loaded when they show up in two zoomers
    if (loadedImages.hasOwnProperty(t.name)) {

      t.imageObj = loadedImages[t.name];
      cb(null,t);

    } else {

      var imageObj = new Image();
      imageObj.src = imagePath;
      t.imageObj = imageObj;
      loadedImages[t.name] = t.imageObj;

      imageObj.onload = function() { cb(null,t); };

    }
  }

  function round(value, decimals) { return Number(Math.round(value+'e'+decimals)+'e-'+decimals); }
  function addCommas(x) { return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  function hexa(hex, opacity){
    hex = hex.replace('#','');
    if (hex.length === 3) hex = ''+ hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]; // account for #f00 syntax
    r = parseInt(hex.substring(0,2), 16);
    g = parseInt(hex.substring(2,4), 16);
    b = parseInt(hex.substring(4,6), 16);

    result = 'rgba('+r+','+g+','+b+','+opacity+')';
    return result;
  }

  console.log('boot')
  return boot;
})();