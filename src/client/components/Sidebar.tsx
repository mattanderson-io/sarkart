import type { ComponentChildren } from 'preact';
import { assetPath } from '../asset-path';

type NavIconProps = {
  id: string;
};

function NavIcon({ id }: NavIconProps) {
  return (
    <svg className="icon" aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

type MenuLinkProps = {
  id: string;
  icon: string;
  className?: string;
  children: ComponentChildren;
};

function MenuLink({ id, icon, className, children }: MenuLinkProps) {
  return (
    <a href="#" id={id} className={className}>
      <NavIcon id={icon} />
      {children}
    </a>
  );
}

type CollapseMenuProps = {
  href: string;
  id: string;
  icon: string;
  label: string;
  children: ComponentChildren;
};

function CollapseMenu({ href, id, icon, label, children }: CollapseMenuProps) {
  return (
    <>
      <a href={href} id={id} data-bs-toggle="collapse" aria-expanded="false" className="dropdown">
        <NavIcon id={icon} />
        {label}
      </a>
      {children}
    </>
  );
}

export function Sidebar() {
  return (
    <nav id="sidebar" className="collapse scrolling">
      <div className="sidebar-header">
        <h3>
          <img className="sar-logo" src={assetPath('images/racing-penguin.webp')} alt="SARkart logo" />
          <span className="brand-text"><span className="brand-sar">SAR</span>kart</span>
        </h3>
        <strong><span className="logo-mini"><img className="sar-logo" src={assetPath('images/racing-penguin.webp')} alt="SARkart logo" /></span></strong>
      </div>

      <ul className="list-unstyled components hide sidebar-nav">
        <li className="active nav-item-primary nav-sec-primary">
          <MenuLink id="btnSAR" icon="i-layout-dashboard">Dashboard</MenuLink>
        </li>

        <li className="nav-item-primary nav-sec-primary nav-item-heatmaps">
          <MenuLink id="btnHeatmap" icon="i-flame" className="show">Heatmaps</MenuLink>
        </li>

        <li className="sidebar-section-label sec-compute"><span>Compute</span></li>
        <li className="nav-sec-compute">
          <MenuLink id="btnCPUs" icon="i-cpu">CPU</MenuLink>
          <ul className="collapse list-unstyled" id="ulCPU" data-bs-parent="#sidebar" />
        </li>
        <li className="nav-sec-compute"><MenuLink id="btnLoad" icon="i-gauge">Load</MenuLink></li>

        <li className="sidebar-section-label sec-memory"><span>Memory</span></li>
        <li className="nav-sec-memory">
          <CollapseMenu href="#memorySubmenu" id="btnMem" icon="i-memory" label="Memory">
            <ul className="collapse list-unstyled" id="memorySubmenu" data-bs-parent="#sidebar">
              <li><a href="#" id="btnMemUsg">Memory Used</a></li>
              <li><a href="#" id="btnMemFree">Memory Free</a></li>
              <li><a href="#" id="btnSwapUsg">Swap Usage</a></li>
            </ul>
          </CollapseMenu>
        </li>
        <li className="nav-sec-memory">
          <CollapseMenu href="#processesSubmenu" id="btnProcesses" icon="i-processes" label="Processes">
            <ul className="collapse list-unstyled" id="processesSubmenu" data-bs-parent="#sidebar">
              <li><a href="#" id="btnProcs">Processes</a></li>
              <li><a href="#" id="btnSwap">Swapping</a></li>
              <li><a href="#" id="btnPaging">Paging Activity</a></li>
              <li><a href="#" id="btnPage">Page</a></li>
            </ul>
          </CollapseMenu>
        </li>

        <li className="sidebar-section-label sec-storage"><span>Storage &amp; I/O</span></li>
        <li className="nav-sec-storage"><MenuLink id="btnIO" icon="i-harddrive">I/O</MenuLink></li>
        <li className="nav-sec-storage">
          <CollapseMenu href="#ulDev" id="btnDevices" icon="i-database" label="Devices">
            <ul className="collapse list-unstyled" id="ulDev" data-bs-parent="#sidebar" />
          </CollapseMenu>
        </li>

        <li className="sidebar-section-label sec-network"><span>Network</span></li>
        <li className="nav-sec-network">
          <CollapseMenu href="#ulInterfaceTraffic" id="btnInterfaceTraffics" icon="i-arrow-left-right" label="Interface Traffic">
            <ul className="collapse list-unstyled" id="ulInterfaceTraffic" data-bs-parent="#sidebar" />
          </CollapseMenu>
        </li>
        <li className="nav-sec-network">
          <CollapseMenu href="#ulInterfaceErrors" id="btnInterfaceErrors" icon="i-alert" label="Interface Errors">
            <ul className="collapse list-unstyled" id="ulInterfaceErrors" data-bs-parent="#sidebar" />
          </CollapseMenu>
        </li>
        <li className="nav-sec-network">
          <CollapseMenu href="#ulNFS" id="btnNFS" icon="i-server" label="NFS">
            <ul className="collapse list-unstyled" id="ulNFS" data-bs-parent="#sidebar">
              <li><a href="#" id="btnNFSClient">NFS Client</a></li>
              <li><a href="#" id="btnNFSServer">NFS Server</a></li>
            </ul>
          </CollapseMenu>
        </li>
        <li className="nav-sec-network"><MenuLink id="btnSockets" icon="i-plug">Sockets</MenuLink></li>
      </ul>
    </nav>
  );
}
