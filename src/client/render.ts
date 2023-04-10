// We've set up this sample using CSS modules, which lets you import class
// names into JavaScript: https://github.com/css-modules/css-modules
// You can configure or change this in the webpack.config.js file.
import * as style from './style.css';
import type { RendererContext } from 'vscode-notebook-renderer';

interface IRenderInfo {
	container: HTMLElement;
	mime: string;
	value: any;
	context: RendererContext<unknown>;
}

function getResizeEventListener(frameID: string): EventListenerOrEventListenerObject{
	return (e: any) => {
		var thisFrame = document.getElementById(`${frameID}`) as HTMLIFrameElement;
		if (thisFrame === null) {
			console.log(`NULLED: ${frameID}`);
		} else if (thisFrame.contentWindow === e.source) {
			thisFrame.height = e.data.height + "px";
			thisFrame.style.height = e.data.height + "px";
		}
	};
}

export function renderMultiple({container, mime, value} : IRenderInfo) {
	value = value as Array<any>;

	//value.array.forEach(element => {
		
	//});

}

// This function is called to render your contents.
export function render({ container, mime, value }: IRenderInfo) {
	// Format the JSON and insert it as <pre><code>{ ... }</code></pre>
	// Replace this with your custom code!
	let frameID = `output-frame-${value.id}`;

	let title = document.createElement("h2");
	title.innerText = "Hosting at: ";
	let hostingLink = document.createElement("a");
	hostingLink.href = value.address;
	hostingLink.innerText = value.address;
	title.appendChild(hostingLink);

	let iframe = document.createElement("iframe");
	iframe.id = frameID;
	iframe.setAttribute("scrolling", "no");
	iframe.classList.add(style.vdmIframeOutput);
	iframe.sandbox.add("allow-same-origin", "allow-scripts");
	iframe.allow = "cross-origin-isolated";
	iframe.src = value.address;
	iframe.title = value.address;

	/*let iframe = `<iframe id="${frameID}" scrolling="no" 
				style="position: relative; float: right; width: 100%;" sandbox="allow-same-origin allow-scripts" 
				allow="cross-origin-isolated" src="${value.accessURL}" title="${value.displayName}">
				</iframe>`;*/

	let iframeContainer = document.createElement("div");
	iframeContainer.id = "vdm-iframe-container";
	iframeContainer.classList.add(style.vdmWebEmbed);
	iframeContainer.appendChild(iframe);
	container.appendChild(title);
	container.appendChild(iframeContainer);

	window.addEventListener("message", getResizeEventListener(frameID));
}

export function rerender({ container, mime, value }: IRenderInfo) {
	let frameID = `output-frame-${value.id}`;

	if(container.children.length !== 2){
		throw new Error("Rerender on invalid node");
	};

	let titles = container.getElementsByTagName("h2");
	if(titles.length !== 1){
		throw new Error("Rerender on invalid node");
	}	

	let title = titles[0];
	if(title.children.length !== 1){
		throw new Error("Rerender on invalid node");
	}

	(title.children[0] as HTMLLinkElement).href = value.address;
	(title.children[0] as HTMLLinkElement).innerText = value.address;

	let iframeContainers = container.getElementsByTagName("iframe");
	if(iframeContainers.length !== 1){
		throw new Error("Rerender on invalid node");
	}

	let iframe = iframeContainers[0] as HTMLIFrameElement;

	iframe.src = value.address;
	iframe.title = value.address;

	window.removeEventListener("message", getResizeEventListener(iframe.id));
	window.addEventListener("message", getResizeEventListener(frameID));

	iframe.id = frameID;

	setTimeout(() => {
		iframe.src += '';
	}, 100);
}

if (module.hot) {
	module.hot.addDisposeHandler(() => {
		// In development, this will be called before the renderer is reloaded. You
		// can use this to clean up or stash any state.
	});
}
