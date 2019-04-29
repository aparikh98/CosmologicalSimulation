window.fullofstars = window.fullofstars || {};


(function() {


    fullofstars.updateViewport = function(window, renderer, camera, skybox) {
        var w = window.innerWidth;
        var h = window.innerHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        skybox.camera.aspect = w / h;
        skybox.camera.updateProjectionMatrix();
    };



    function createCloudGeometryFromBodies(bodies) {
        // create the particle variables
        var particleCount = bodies.length;
        var particles = new THREE.Geometry();
        var colors = new Array(particleCount);

        // now create the individual particles
        for (var p = 0; p < particleCount; p++) {
            particle = bodies[p].position;
            // add it to the geometry
            particles.vertices.push(particle);
            colors[p] = new THREE.Color(1,1,1);
        }
        particles.colors = colors;
        return particles;
    }

    function colorParticles(bodies, pointCloud, colorSelectingFunc) {
        var particleCount = bodies.length;
        var particles = new THREE.Geometry();

        for (var p = 0; p < particleCount; p++) {
            particle = bodies[p].position;
            var massFactor = bodies[p].mass / fullofstars.TYPICAL_STAR_MASS;

            colorSelectingFunc(bodies[p], pointCloud.geometry.colors[p]);
        }
        pointCloud.geometry.colorsNeedUpdate = true;
    }

    function colorStar(body, existingColor) {
        if(body.mass > 0.9999*fullofstars.TYPICAL_STAR_MASS * 100) {
            // Black hole color
            color = new THREE.Color(0,0,0); }
        else {
            // Normal color
            var massFactor = body.mass / fullofstars.TYPICAL_STAR_MASS;

            if(massFactor < 0.002) {
                existingColor.setRGB(0.9+0.1*Math.random(), 0.4 + 0.4*Math.random(), 0.4 + 0.4 * Math.random());
            }
            else if(massFactor < 0.004) {
                existingColor.setRGB(0.5+0.1*Math.random(), 0.5 + 0.2*Math.random(), 0.9 + 0.1 * Math.random());
            } else {
                existingColor.setRGB(0.6+0.4 * massFactor, 0.6+0.4 * massFactor, 0.5 + 0.3 * massFactor);
            }
        }
    }

    function colorGasCloud(body, existingColor) {
        var massFactor = body.mass / fullofstars.TYPICAL_STAR_MASS;
        existingColor.setHSL(0.65 + 0.2*Math.cos(body.position.x*0.002), 0.4 + 0.6*Math.random(), 0.5 + 0.5*Math.random());
    }



    function updateDebugPanel(heavyBodiesApplicator, vfxBodies, gasBodies) {
        var dp = $("#debug_panel");

        dp.find(".heavy-bodies .close-interactions .value").text(formatScientificNotationFixedWidth(heavyBodiesApplicator.closeInteractionCount, 4, 2));
    }


    function createSkyboxStuff() {
        // Make a skybox
        var urls = [
            // Light blue cubemap
            // 'textures/BlueNebular_left.jpg',
            // 'textures/BlueNebular_right.jpg',
            // 'textures/BlueNebular_top.jpg',
            // 'textures/BlueNebular_bottom.jpg',
            // 'textures/BlueNebular_front.jpg',
            // 'textures/BlueNebular_back.jpg',

            // Blue cubemap
            // 'textures/bkg1_left.jpg',
            // 'textures/bkg1_right.jpg',
            // 'textures/bkg1_top.jpg',
            // 'textures/bkg1_bottom.jpg',
            // 'textures/bkg1_front.jpg',
            // 'textures/bkg1_back.jpg',

            // Red cubemap
            'textures/bkg2_left.jpg',
            'textures/bkg2_right.jpg',
            'textures/bkg2_top.jpg',
            'textures/bkg2_bottom.jpg',
            'textures/bkg2_front.jpg',
            'textures/bkg2_back.jpg',
        ];

        var skyboxScene = new THREE.Scene();
        var skyboxCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 100, 60000 );

        var cubemap = THREE.ImageUtils.loadTextureCube(urls); // load textures
        cubemap.format = THREE.RGBFormat;

        var skyboxShader = THREE.ShaderLib['cube']; // init cube shader from built-in lib
        skyboxShader.uniforms['tCube'].value = cubemap; // apply textures to shader

        // create shader material
        var skyBoxMaterial = new THREE.ShaderMaterial( {
          fragmentShader: skyboxShader.fragmentShader,
          vertexShader: skyboxShader.vertexShader,
          uniforms: skyboxShader.uniforms,
          depthWrite: false,
          side: THREE.BackSide
        });

        // create skybox mesh
        var skybox = new THREE.Mesh(
          new THREE.BoxGeometry(50000,50000,50000),
          skyBoxMaterial
        );
        skyboxScene.add(skybox);

        return { scene: skyboxScene, camera: skyboxCamera };
    }


    $(function() {


        var renderer = new THREE.WebGLRenderer({antialias: false});
        renderer.setSize( 300, 200 );
        renderer.setPixelRatio( window.devicePixelRatio ); // adapt to retina display (runs slower)
        // renderer.setPixelRatio( 1 );
        renderer.setClearColor(0x000000);
        renderer.sortObjects = false;
        document.body.appendChild(renderer.domElement);
        var scene = new THREE.Scene();

        var camera = new THREE.PerspectiveCamera(
            45,         // Field of view
            1200 / 800,  // Aspect ratio
            .0001 * fullofstars.MILKY_WAY_DIAMETER * fullofstars.UNIVERSE_SCALE,         // Near
            10 * fullofstars.MILKY_WAY_DIAMETER * fullofstars.UNIVERSE_SCALE       // Far
        );

        var controls = new THREE.OrbitControls( camera, renderer.domElement );
        controls.screenSpacePanning = false;

        controls.minDistance = 200;
        controls.maxDistance = 3000;

        var skybox = createSkyboxStuff();
        fullofstars.updateViewport(window, renderer, camera, skybox);
        window.addEventListener('resize', function() {fullofstars.updateViewport(window, renderer, camera, skybox)});


        var materials = fullofstars.createAllMaterials();

        var BODYCOUNT = 500; // default: 500
        var BODYCOUNT_VFX = 20000; // default: 20000
        var BODYCOUNT_GAS = 300; //default: 300
        var FAR_UPDATE_PERIOD = 2.0; // How long between updates of far interactions
        var FAR_BODYCOUNT_PER_60FPS_FRAME = Math.max(1, BODYCOUNT / (60*FAR_UPDATE_PERIOD));
        console.log("FAR_BODYCOUNT_PER_60FPS_FRAME", FAR_BODYCOUNT_PER_60FPS_FRAME);

        var bodies = fullofstars.createGravitySystem(BODYCOUNT, fullofstars.TYPICAL_STAR_MASS, true);
        var bodiesVfx = fullofstars.createGravitySystem(BODYCOUNT_VFX, 0.3*fullofstars.TYPICAL_STAR_MASS, false);
        var bodiesGas = fullofstars.createGravitySystem(BODYCOUNT_GAS, 0.2*fullofstars.TYPICAL_STAR_MASS, false);


        var mesh = new THREE.PointCloud( createCloudGeometryFromBodies(bodies), materials.bright );
        mesh.frustumCulled = false;
        var meshVfx = new THREE.PointCloud( createCloudGeometryFromBodies(bodiesVfx), materials.brightSmall );
        meshVfx.frustumCulled = false;
        var meshGas = new THREE.PointCloud( createCloudGeometryFromBodies(bodiesGas), materials.gasCloud );
        meshGas.frustumCulled = false;

        colorParticles(bodies, mesh, colorStar);
        colorParticles(bodiesVfx, meshVfx, colorStar);
        colorParticles(bodiesGas, meshGas, colorGasCloud);

        // Add desired order of rendering
        scene.add(meshGas);
        scene.add(mesh);
        scene.add(meshVfx);

        var CAMERA_MODES = {ORBIT: 0, CUSTOM: 2}
        var cameraMode = CAMERA_MODES.ORBIT;

        var TIME_SCALE = Math.pow(10, 9);
        var TIME_SCALES = [Math.pow(10, 9), 3*Math.pow(10, 8), 1*Math.pow(10, 8), 0.0];
        var timeScaleIndex = 0;
        var timeScale = TIME_SCALE;
        $("body").on("keypress", function(e) {
            console.log("Pressed", e.which);
            if(_.contains([32], e.which)) {
                console.log("FOO");
                timeScaleIndex = (timeScaleIndex + 1) % TIME_SCALES.length;
                timeScale = TIME_SCALES[timeScaleIndex];
            }
            else if(_.contains([49], e.which)) {
                makeCameraTransition(function() {
                    cameraMode = CAMERA_MODES.ORBIT;
                });
            }
            else if(_.contains([50], e.which)) {
                makeCameraTransition(function() {
                    cameraMode = CAMERA_MODES.CUSTOM;
                });
            }            
        });

        function makeCameraTransition(transitionFunc) {
            $("#loading_cover").fadeIn(300, function() {
                transitionFunc();
                $("#loading_cover").fadeOut(300);
            });
        }

        function render() {
            renderer.autoclear = false;
            renderer.autoClearColor = false;
            skybox.camera.quaternion.copy(camera.quaternion);
            renderer.render(skybox.scene, skybox.camera);
            renderer.render(scene, camera);
        }

        var lastT = 0.0;
        var accumulatedFarDt = 0.0;
        var accumulatedRealDtTotal = 0.0;
        var gravityApplicator = fullofstars.createTwoTierSmartGravityApplicator(bodies, bodies);
        var gravityApplicatorVfx = fullofstars.createTwoTierSmartGravityApplicator(bodiesVfx, bodies);
        var gravityApplicatorGas = fullofstars.createTwoTierSmartGravityApplicator(bodiesGas, bodies);
        gravityApplicator.updateForces(bodies.length);
        gravityApplicatorVfx.updateForces(bodiesVfx.length);
        gravityApplicatorGas.updateForces(bodiesGas.length);

        var started = false;
        THREE.DefaultLoadingManager.onProgress = function (item, loaded, total) {
            var loadingMessages = [
                "Inventing universe...", "Making apple pie...", "Venturing to the stars...", "Awaiting glorious dawn..."
            ];
            var textIndex = Math.min(Math.floor((loaded / total) * loadingMessages.length), loadingMessages.length-1);
            $("#loading_indicator .loading_text").text(loadingMessages[textIndex]);
            $("#loading_indicator .loading_bar").width(100*loaded/total + "%");
            if(loaded === total && !started) {
                started = true;
                $("#loading_indicator").delay(200).fadeOut(400);
                $("#loading_cover").delay(600).fadeOut(1000);
                $("#footnote").delay(5000).fadeOut(2000);
                startGalaxySimulation();
            }
        };


        function startGalaxySimulation() {
            function update(t) {
                var dt = (t - lastT) * 0.001;
                dt = Math.min(1 / 60.0, dt); // Clamp
                accumulatedRealDtTotal += dt;

                var positionScale = 1.5 * fullofstars.MILKY_WAY_DIAMETER * fullofstars.UNIVERSE_SCALE;

                if (cameraMode === CAMERA_MODES.ORBIT) {
                    var cameraRotationSpeed = 0.01; // default: 0.03
                    camera.position.copy(bodies[0].position);
                    camera.position.add(new THREE.Vector3(
                        Math.cos(accumulatedRealDtTotal*cameraRotationSpeed) * positionScale, 
                        0.5 * positionScale * 0.7 * Math.sin(accumulatedRealDtTotal * 0.2), // scale to slow vertical movement
                        Math.sin(accumulatedRealDtTotal*cameraRotationSpeed) * positionScale
                    ));

                    var cameraLookatRotationSpeed = 0; // default: 0.01
                    var cameraLookAtScale = 0.2 * positionScale;
                    var cameraLookAtPos = new THREE.Vector3().copy(bodies[0].position);
                    cameraLookAtPos.add(new THREE.Vector3(Math.cos(accumulatedRealDtTotal*cameraLookatRotationSpeed) * cameraLookAtScale, -positionScale * 0.07 * Math.sin(accumulatedRealDtTotal * 0.2), Math.sin(accumulatedRealDtTotal*cameraLookatRotationSpeed) * cameraLookAtScale))
                    camera.lookAt(cameraLookAtPos);
                }


                dt *= timeScale;
                accumulatedFarDt += dt;

                // This step updates positions
                fullofstars.PointMassBody.velocityVerletUpdate(bodies, dt, true);
                fullofstars.PointMassBody.velocityVerletUpdate(bodiesVfx, dt, true);
                fullofstars.PointMassBody.velocityVerletUpdate(bodiesGas, dt, true);

                for(var i=0, len=bodies.length; i<len; i++) {
                    mesh.geometry.vertices[i].copy(bodies[i].position);
                }

                for(var i=0, len=bodiesVfx.length; i<len; i++) {
                    meshVfx.geometry.vertices[i].copy(bodiesVfx[i].position);
                }

                for(var i=0, len=bodiesGas.length; i<len; i++) {
                    meshGas.geometry.vertices[i].copy(bodiesGas[i].position);
                }

                // This step updates velocities, so we can reuse forces for next position update (they will be the same because positios did not change)
                if(accumulatedFarDt >= TIME_SCALE / 60.0) {
                    gravityApplicator.updateForces(FAR_BODYCOUNT_PER_60FPS_FRAME);
                    gravityApplicatorVfx.updateForces(FAR_BODYCOUNT_PER_60FPS_FRAME*20);
                    gravityApplicatorGas.updateForces(FAR_BODYCOUNT_PER_60FPS_FRAME);
                    accumulatedFarDt -= TIME_SCALE/60;
                }

                fullofstars.PointMassBody.velocityVerletUpdate(bodies, dt, false);
                fullofstars.PointMassBody.velocityVerletUpdate(bodiesVfx, dt, false);
                fullofstars.PointMassBody.velocityVerletUpdate(bodiesGas, dt, false);

                mesh.geometry.verticesNeedUpdate = true;
                meshVfx.geometry.verticesNeedUpdate = true;
                meshGas.geometry.verticesNeedUpdate = true;
                lastT = t;
                updateDebugPanel(gravityApplicator, bodiesVfx, bodiesGas);
            };

            function handleAnimationFrame(dt) {
                update(dt);
                controls.update();
                render();
                window.requestAnimationFrame(handleAnimationFrame);
            };
            window.requestAnimationFrame(handleAnimationFrame);

        };
    });
})();